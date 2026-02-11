import { handleAndReturnErrorResponse } from "@/lib/api/errors";
import { ratelimitOrThrow } from "@/lib/api/utils";
import { getShortLinkViaEdge, getWorkspaceViaEdge } from "@/lib/planetscale";
import { getDomainViaEdge } from "@/lib/planetscale/get-domain-via-edge";
import { QRCodeSVG } from "@/lib/qr/utils";
import { getQRCodeQuerySchema } from "@/lib/zod/schemas/qr";
import { DUB_QR_LOGO, getSearchParams, isDubDomain } from "@dub/utils";
import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";

export const runtime = "edge";

const CORS_HEADERS = new Headers({
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
});

/**
 * Plan-based licensing for QR code types.
 * Maps each QR type to the minimum plan required.
 */
const QR_TYPE_PLAN_REQUIREMENTS: Record<string, string> = {
  standard: "free",
  micro: "free",
  compact: "pro",
  custom: "pro",
  holographic: "business",
  cube3d: "business",
};

const PLAN_HIERARCHY: Record<string, number> = {
  free: 0,
  pro: 1,
  business: 2,
  enterprise: 3,
};

function checkQRTypePlanAccess(
  qrType: string,
  workspacePlan: string | null | undefined,
): { allowed: boolean; requiredPlan: string } {
  const requiredPlan = QR_TYPE_PLAN_REQUIREMENTS[qrType] || "business";
  const userLevel = PLAN_HIERARCHY[workspacePlan || "free"] ?? 0;
  const requiredLevel = PLAN_HIERARCHY[requiredPlan] ?? 0;
  return { allowed: userLevel >= requiredLevel, requiredPlan };
}

export async function GET(req: NextRequest) {
  try {
    const paramsParsed = getQRCodeQuerySchema.parse(getSearchParams(req.url));

    await ratelimitOrThrow(req, "qr");

    const {
      logo,
      url,
      size,
      level,
      fgColor,
      bgColor,
      margin,
      hideLogo,
      qrType,
      dotStyle,
      cornerStyle,
      gradientDirection,
      gradientStartColor,
      gradientEndColor,
    } = paramsParsed;

    // Look up workspace plan for licensing check
    const shortLink = await getShortLinkViaEdge(url.split("?")[0]);
    let workspacePlan: string | null = null;

    if (shortLink) {
      const workspace = await getWorkspaceViaEdge({
        workspaceId: shortLink.projectId,
      });
      workspacePlan = workspace?.plan || null;
    }

    // Enforce plan-based licensing for advanced QR types
    if (qrType !== "standard") {
      const { allowed, requiredPlan } = checkQRTypePlanAccess(
        qrType,
        workspacePlan,
      );
      if (!allowed) {
        return new Response(
          JSON.stringify({
            error: {
              code: "forbidden",
              message: `The "${qrType}" QR code type requires a ${requiredPlan} plan or above. Upgrade to access this feature.`,
              doc_url: "https://dub.co/help/article/custom-qr-codes",
            },
          }),
          {
            status: 403,
            headers: new Headers({
              ...Object.fromEntries(CORS_HEADERS.entries()),
              "Content-Type": "application/json",
            }),
          },
        );
      }
    }

    // For micro/compact types, force hide logo for cleaner output
    const effectiveHideLogo =
      qrType === "micro" || qrType === "compact" ? true : hideLogo;
    const effectiveMargin = qrType === "micro" ? Math.min(margin, 1) : margin;

    const qrCodeLogo = await getQRCodeLogo({
      url,
      logo,
      hideLogo: effectiveHideLogo,
      workspacePlan,
    });

    // Build style settings for custom/holographic types
    const qrStyle =
      qrType === "custom" || qrType === "holographic"
        ? {
            dotStyle,
            cornerStyle,
            ...(qrType === "holographic" && {
              gradientDirection,
              gradientStartColor,
              gradientEndColor,
            }),
          }
        : undefined;

    return new ImageResponse(
      QRCodeSVG({
        value: url,
        size,
        level,
        fgColor,
        bgColor,
        margin: effectiveMargin,
        qrType,
        qrStyle,
        ...(qrCodeLogo
          ? {
              imageSettings: {
                src: qrCodeLogo,
                height: size / 4,
                width: size / 4,
                excavate: true,
              },
            }
          : {}),
        isOGContext: true,
      }),
      {
        width: size,
        height: size,
        headers: CORS_HEADERS,
      },
    );
  } catch (error) {
    return handleAndReturnErrorResponse(error, CORS_HEADERS);
  }
}

const getQRCodeLogo = async ({
  url,
  logo,
  hideLogo,
  workspacePlan,
}: {
  url: string;
  logo: string | undefined;
  hideLogo: boolean;
  workspacePlan: string | null;
}) => {
  const shortLink = await getShortLinkViaEdge(url.split("?")[0]);

  // Not a Dub link
  if (!shortLink) {
    return DUB_QR_LOGO;
  }

  // Free plan always gets the Dub logo (branding enforcement)
  if (workspacePlan === "free" || !workspacePlan) {
    return DUB_QR_LOGO;
  }

  // if hideLogo is set, return null
  if (hideLogo) {
    return null;
  }

  // if logo is passed, return it
  if (logo) {
    return logo;
  }

  const workspace = await getWorkspaceViaEdge({
    workspaceId: shortLink.projectId,
  });

  // if it's a Dub owned domain and no workspace logo is set, use the Dub logo
  if (isDubDomain(shortLink.domain) && !workspace?.logo) {
    return DUB_QR_LOGO;
  }

  // if it's a custom domain, check if it has a logo
  const domain = await getDomainViaEdge(shortLink.domain);

  // return domain logo if it has one, otherwise fallback to workspace logo, and finally fallback to Dub logo
  return domain?.logo || workspace?.logo || DUB_QR_LOGO;
};

export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}

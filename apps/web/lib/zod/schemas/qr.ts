import {
  DEFAULT_BGCOLOR,
  DEFAULT_FGCOLOR,
  DEFAULT_MARGIN,
  QR_LEVELS,
} from "@/lib/qr/constants";
import * as z from "zod/v4";
import { booleanQuerySchema } from "./misc";
import { parseUrlSchema } from "./utils";

const QR_CODE_TYPES = ["standard", "micro", "compact", "custom", "holographic", "cube3d"] as const;
const QR_DOT_STYLE_VALUES = ["square", "rounded", "circle", "diamond"] as const;
const QR_CORNER_STYLE_VALUES = ["square", "rounded", "circle"] as const;
const QR_GRADIENT_DIRECTION_VALUES = ["horizontal", "vertical", "diagonal", "radial"] as const;

export const getQRCodeQuerySchema = z.object({
  url: parseUrlSchema.describe("The URL to generate a QR code for."),
  logo: z
    .string()
    .optional()
    .describe(
      "The logo to include in the QR code. Can only be used with a paid plan on Dub.",
    ),
  size: z.coerce
    .number()
    .optional()
    .default(600)
    .describe(
      "The size of the QR code in pixels. Defaults to `600` if not provided.",
    ),
  level: z
    .enum(QR_LEVELS)
    .optional()
    .default("L")
    .describe(
      "The level of error correction to use for the QR code. Defaults to `L` if not provided.",
    ),
  fgColor: z
    .string()
    .optional()
    .default(DEFAULT_FGCOLOR)
    .describe(
      "The foreground color of the QR code in hex format. Defaults to `#000000` if not provided.",
    ),
  bgColor: z
    .string()
    .optional()
    .default(DEFAULT_BGCOLOR)
    .describe(
      "The background color of the QR code in hex format. Defaults to `#ffffff` if not provided.",
    ),
  hideLogo: booleanQuerySchema
    .optional()
    .default(false)
    .describe(
      "Whether to hide the logo in the QR code. Can only be used with a paid plan on Dub.",
    ),
  margin: z.coerce
    .number()
    .optional()
    .default(DEFAULT_MARGIN)
    .describe(
      `The size of the margin around the QR code. Defaults to ${DEFAULT_MARGIN} if not provided.`,
    ),
  includeMargin: booleanQuerySchema
    .optional()
    .default(true)
    .describe(
      "DEPRECATED: Margin is included by default. Use the `margin` prop to customize the margin size.",
    )
    .meta({ deprecated: true }),
  qrType: z
    .enum(QR_CODE_TYPES)
    .optional()
    .default("standard")
    .describe(
      "The type of QR code to generate. Options: standard, micro, compact, custom, holographic, cube3d.",
    ),
  dotStyle: z
    .enum(QR_DOT_STYLE_VALUES)
    .optional()
    .default("square")
    .describe(
      "The dot style for custom/holographic QR codes. Options: square, rounded, circle, diamond.",
    ),
  cornerStyle: z
    .enum(QR_CORNER_STYLE_VALUES)
    .optional()
    .default("square")
    .describe(
      "The corner (finder pattern) style for custom/holographic QR codes. Options: square, rounded, circle.",
    ),
  gradientDirection: z
    .enum(QR_GRADIENT_DIRECTION_VALUES)
    .optional()
    .default("horizontal")
    .describe(
      "The gradient direction for holographic QR codes. Options: horizontal, vertical, diagonal, radial.",
    ),
  gradientStartColor: z
    .string()
    .optional()
    .default("#8A2BE2")
    .describe(
      "The starting color of the holographic gradient in hex format.",
    ),
  gradientEndColor: z
    .string()
    .optional()
    .default("#00CED1")
    .describe(
      "The ending color of the holographic gradient in hex format.",
    ),
});

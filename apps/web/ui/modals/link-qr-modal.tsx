import { getQRAsCanvas, getQRAsSVGDataUri, getQRData } from "@/lib/qr";
import {
  HOLOGRAPHIC_PRESETS,
  QR_CORNER_STYLES,
  QR_DOT_STYLES,
  QR_GRADIENT_DIRECTIONS,
  QR_TYPE_OPTIONS,
} from "@/lib/qr/constants";
import type {
  GradientDirection,
  QRCodeType,
  QRCornerStyle,
  QRDotStyle,
  QRStyleSettings,
} from "@/lib/qr/types";
import useDomain from "@/lib/swr/use-domain";
import useWorkspace from "@/lib/swr/use-workspace";
import { QRLinkProps } from "@/lib/types";
import { QRCode, QRCodeCube3D } from "@/ui/shared/qr-code";
import {
  Button,
  ButtonTooltip,
  IconMenu,
  InfoTooltip,
  Modal,
  Popover,
  ShimmerDots,
  Switch,
  Tooltip,
  TooltipContent,
  useCopyToClipboard,
  useLocalStorage,
  useMediaQuery,
} from "@dub/ui";
import {
  Check,
  Check2,
  Copy,
  CrownSmall,
  Download,
  Hyperlink,
  Photo,
} from "@dub/ui/icons";
import { API_DOMAIN, cn, DUB_QR_LOGO, linkConstructor } from "@dub/utils";
import { AnimatePresence, motion } from "motion/react";
import {
  Dispatch,
  PropsWithChildren,
  SetStateAction,
  useCallback,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { HexColorInput, HexColorPicker } from "react-colorful";
import { toast } from "sonner";
import { useDebouncedCallback } from "use-debounce";
import { ProBadgeTooltip } from "../shared/pro-badge-tooltip";

const DEFAULT_COLORS = [
  "#000000",
  "#C73E33",
  "#DF6547",
  "#F4B3D7",
  "#F6CF54",
  "#49A065",
  "#2146B7",
  "#AE49BF",
];

export type QRCodeDesign = {
  fgColor: string;
  hideLogo: boolean;
  qrType: QRCodeType;
  qrStyle: QRStyleSettings;
};

type LinkQRModalProps = {
  props: QRLinkProps;
  onSave?: (data: QRCodeDesign) => void;
};

function LinkQRModal(
  props: {
    showLinkQRModal: boolean;
    setShowLinkQRModal: Dispatch<SetStateAction<boolean>>;
  } & LinkQRModalProps,
) {
  return (
    <Modal
      showModal={props.showLinkQRModal}
      setShowModal={props.setShowLinkQRModal}
      className="max-w-[500px]"
    >
      <LinkQRModalInner {...props} />
    </Modal>
  );
}

function LinkQRModalInner({
  props,
  onSave,
  showLinkQRModal,
  setShowLinkQRModal,
}: {
  showLinkQRModal: boolean;
  setShowLinkQRModal: Dispatch<SetStateAction<boolean>>;
} & LinkQRModalProps) {
  const { id: workspaceId, slug, plan, logo: workspaceLogo } = useWorkspace();
  const id = useId();
  const { isMobile } = useMediaQuery();
  const { logo: domainLogo } = useDomain({
    slug: props.domain,
    enabled: showLinkQRModal,
  });

  const url = useMemo(() => {
    return props.key && props.domain
      ? linkConstructor({ key: props.key, domain: props.domain })
      : undefined;
  }, [props.key, props.domain]);

  const [dataPersisted, setDataPersisted] = useLocalStorage<QRCodeDesign>(
    `qr-code-design-${workspaceId}`,
    {
      fgColor: "#000000",
      hideLogo: false,
      qrType: "standard",
      qrStyle: {},
    },
  );

  const [data, setData] = useState(dataPersisted);

  const hideLogo = data.hideLogo && plan !== "free";
  const logo =
    plan === "free" ? DUB_QR_LOGO : domainLogo || workspaceLogo || DUB_QR_LOGO;

  const qrData = useMemo(
    () =>
      url
        ? getQRData({
            url,
            fgColor: data.fgColor,
            hideLogo,
            logo,
            qrType: data.qrType || "standard",
            qrStyle: data.qrStyle,
          })
        : null,
    [url, data, hideLogo, logo],
  );

  const onColorChange = useDebouncedCallback(
    (color: string) => setData((d) => ({ ...d, fgColor: color })),
    500,
  );

  const showCustomStyleOptions =
    data.qrType === "custom" || data.qrType === "holographic";
  const showHolographicOptions = data.qrType === "holographic";
  const isCube3D = data.qrType === "cube3d";

  return (
    <form
      className="flex flex-col gap-6 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setShowLinkQRModal(false);

        setDataPersisted(data);
        onSave?.(data);
      }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-medium">QR Code</h3>
          <ProBadgeTooltip content="Set a custom QR code design to improve click-through rates. [Learn more.](https://dub.co/help/article/custom-qr-codes)" />
        </div>
        <div className="max-md:hidden">
          <Tooltip
            content={
              <div className="px-2 py-1 text-xs text-neutral-700">
                Press{" "}
                <strong className="font-medium text-neutral-950">Q</strong> to
                open this quickly
              </div>
            }
            side="right"
          >
            <kbd className="flex size-6 cursor-default items-center justify-center rounded-md border border-neutral-200 font-sans text-xs text-neutral-950">
              Q
            </kbd>
          </Tooltip>
        </div>
      </div>

      {/* QR Code Type Selector */}
      <div>
        <span className="block text-sm font-medium text-neutral-700">
          QR Code Type
        </span>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {QR_TYPE_OPTIONS.map((option) => {
            const isSelected = (data.qrType || "standard") === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() =>
                  setData((d) => ({
                    ...d,
                    qrType: option.value,
                    // Reset style when switching types
                    qrStyle:
                      option.value === "holographic"
                        ? {
                            dotStyle: "rounded" as QRDotStyle,
                            cornerStyle: "rounded" as QRCornerStyle,
                            gradientDirection: "horizontal" as GradientDirection,
                            gradientStartColor: "#8A2BE2",
                            gradientEndColor: "#00CED1",
                          }
                        : option.value === "custom"
                          ? {
                              dotStyle: "circle" as QRDotStyle,
                              cornerStyle: "square" as QRCornerStyle,
                            }
                          : d.qrStyle,
                  }))
                }
                className={cn(
                  "flex flex-col items-center rounded-lg border p-2 text-center transition-all",
                  isSelected
                    ? "border-black bg-neutral-50 ring-1 ring-black"
                    : "border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50",
                )}
              >
                <span className="text-xs font-medium text-neutral-900">
                  {option.label}
                </span>
                <span className="mt-0.5 text-[10px] text-neutral-500">
                  {option.description}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* QR Preview */}
      <div>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-neutral-700">
              QR Code Preview
            </span>
            <InfoTooltip content="Customize your QR code to fit your brand. [Learn more.](https://dub.co/help/article/custom-qr-codes)" />
          </div>
          {url && qrData && (
            <div className="flex items-center gap-2">
              <DownloadPopover qrData={qrData} props={props}>
                <div>
                  <ButtonTooltip
                    tooltipProps={{
                      content: "Download QR code",
                    }}
                  >
                    <Download className="h-4 w-4 text-neutral-500" />
                  </ButtonTooltip>
                </div>
              </DownloadPopover>
              <CopyPopover qrData={qrData} props={props}>
                <div>
                  <ButtonTooltip
                    tooltipProps={{
                      content: "Copy QR code",
                    }}
                  >
                    <Copy className="h-4 w-4 text-neutral-500" />
                  </ButtonTooltip>
                </div>
              </CopyPopover>
            </div>
          )}
        </div>
        <div className="relative mt-2 flex h-44 items-center justify-center overflow-hidden rounded-md border border-neutral-300">
          {!isMobile && (
            <ShimmerDots className="opacity-30 [mask-image:radial-gradient(40%_80%,transparent_50%,black)]" />
          )}
          {url && (
            <AnimatePresence mode="wait">
              <motion.div
                key={
                  data.fgColor +
                  data.hideLogo +
                  data.qrType +
                  JSON.stringify(data.qrStyle)
                }
                initial={{ filter: "blur(2px)", opacity: 0.4 }}
                animate={{ filter: "blur(0px)", opacity: 1 }}
                exit={{ filter: "blur(2px)", opacity: 0.4 }}
                transition={{ duration: 0.1 }}
                className="relative flex size-full items-center justify-center"
              >
                {isCube3D ? (
                  <QRCodeCube3D
                    url={url}
                    fgColor={data.fgColor}
                    hideLogo={data.hideLogo}
                    logo={logo}
                    cubeSize={100}
                  />
                ) : (
                  <QRCode
                    url={url}
                    fgColor={data.fgColor}
                    hideLogo={data.hideLogo}
                    logo={logo}
                    scale={1}
                    qrType={data.qrType || "standard"}
                    qrStyle={data.qrStyle}
                  />
                )}
              </motion.div>
            </AnimatePresence>
          )}
        </div>
      </div>

      {/* Custom Style Options (for custom/holographic types) */}
      {showCustomStyleOptions && (
        <div className="space-y-3">
          {/* Dot Style */}
          <div>
            <span className="block text-sm font-medium text-neutral-700">
              Dot Style
            </span>
            <div className="mt-1.5 flex gap-2">
              {QR_DOT_STYLES.map((style) => {
                const isSelected =
                  (data.qrStyle?.dotStyle || "square") === style.value;
                return (
                  <button
                    key={style.value}
                    type="button"
                    onClick={() =>
                      setData((d) => ({
                        ...d,
                        qrStyle: { ...d.qrStyle, dotStyle: style.value },
                      }))
                    }
                    className={cn(
                      "rounded-md border px-3 py-1 text-xs font-medium transition-all",
                      isSelected
                        ? "border-black bg-black text-white"
                        : "border-neutral-200 text-neutral-600 hover:border-neutral-300",
                    )}
                  >
                    {style.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Corner Style */}
          <div>
            <span className="block text-sm font-medium text-neutral-700">
              Corner Style
            </span>
            <div className="mt-1.5 flex gap-2">
              {QR_CORNER_STYLES.map((style) => {
                const isSelected =
                  (data.qrStyle?.cornerStyle || "square") === style.value;
                return (
                  <button
                    key={style.value}
                    type="button"
                    onClick={() =>
                      setData((d) => ({
                        ...d,
                        qrStyle: { ...d.qrStyle, cornerStyle: style.value },
                      }))
                    }
                    className={cn(
                      "rounded-md border px-3 py-1 text-xs font-medium transition-all",
                      isSelected
                        ? "border-black bg-black text-white"
                        : "border-neutral-200 text-neutral-600 hover:border-neutral-300",
                    )}
                  >
                    {style.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Holographic Gradient Options */}
      {showHolographicOptions && (
        <div className="space-y-3">
          {/* Gradient Direction */}
          <div>
            <span className="block text-sm font-medium text-neutral-700">
              Gradient Direction
            </span>
            <div className="mt-1.5 flex gap-2">
              {QR_GRADIENT_DIRECTIONS.map((dir) => {
                const isSelected =
                  (data.qrStyle?.gradientDirection || "horizontal") ===
                  dir.value;
                return (
                  <button
                    key={dir.value}
                    type="button"
                    onClick={() =>
                      setData((d) => ({
                        ...d,
                        qrStyle: {
                          ...d.qrStyle,
                          gradientDirection: dir.value,
                        },
                      }))
                    }
                    className={cn(
                      "rounded-md border px-3 py-1 text-xs font-medium transition-all",
                      isSelected
                        ? "border-black bg-black text-white"
                        : "border-neutral-200 text-neutral-600 hover:border-neutral-300",
                    )}
                  >
                    {dir.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Holographic Color Presets */}
          <div>
            <span className="block text-sm font-medium text-neutral-700">
              Holographic Preset
            </span>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {HOLOGRAPHIC_PRESETS.map((preset) => {
                const isSelected =
                  data.qrStyle?.gradientStartColor === preset.start &&
                  data.qrStyle?.gradientEndColor === preset.end;
                return (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() =>
                      setData((d) => ({
                        ...d,
                        qrStyle: {
                          ...d.qrStyle,
                          gradientStartColor: preset.start,
                          gradientEndColor: preset.end,
                        },
                      }))
                    }
                    className={cn(
                      "flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium transition-all",
                      isSelected
                        ? "border-black ring-1 ring-black"
                        : "border-neutral-200 hover:border-neutral-300",
                    )}
                  >
                    <span
                      className="inline-block h-3 w-6 rounded-sm"
                      style={{
                        background: `linear-gradient(to right, ${preset.start}, ${preset.end})`,
                      }}
                    />
                    <span className="text-neutral-600">{preset.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Logo toggle */}
      {!isCube3D && data.qrType !== "micro" && data.qrType !== "compact" && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <label
              className="text-sm font-medium text-neutral-700"
              htmlFor={`${id}-show-logo`}
            >
              Logo
            </label>
            <InfoTooltip content="Display your logo in the center of the QR code. [Learn more.](https://dub.co/help/article/custom-qr-codes)" />
          </div>
          <Switch
            id={`${id}-hide-logo`}
            checked={!data.hideLogo}
            fn={() => {
              setData((d) => ({ ...d, hideLogo: !d.hideLogo }));
            }}
            disabledTooltip={
              !plan || plan === "free" ? (
                <TooltipContent
                  title="You need to be on the Pro plan and above to customize your QR Code logo."
                  cta="Upgrade to Pro"
                  href={slug ? `/${slug}/upgrade` : "https://dub.co/pricing"}
                  target="_blank"
                />
              ) : undefined
            }
            thumbIcon={
              !plan || plan === "free" ? (
                <CrownSmall className="size-full text-neutral-500" />
              ) : undefined
            }
          />
        </div>
      )}

      {/* Color selector (hidden for holographic since it uses gradients) */}
      {!showHolographicOptions && (
        <div>
          <span className="block text-sm font-medium text-neutral-700">
            QR Code Color
          </span>
          <div className="mt-2 flex gap-6">
            <div className="relative flex h-9 w-32 shrink-0 rounded-md shadow-sm">
              <Tooltip
                content={
                  <div className="flex max-w-xs flex-col items-center space-y-3 p-5 text-center">
                    <HexColorPicker
                      color={data.fgColor}
                      onChange={onColorChange}
                    />
                  </div>
                }
              >
                <div
                  className="h-full w-12 rounded-l-md border"
                  style={{
                    backgroundColor: data.fgColor,
                    borderColor: data.fgColor,
                  }}
                />
              </Tooltip>
              <HexColorInput
                id="color"
                name="color"
                color={data.fgColor}
                onChange={onColorChange}
                prefixed
                style={{ borderColor: data.fgColor }}
                className="block w-full rounded-r-md border-2 border-l-0 pl-3 text-neutral-900 placeholder-neutral-400 focus:outline-none focus:ring-black sm:text-sm"
              />
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-3">
              {DEFAULT_COLORS.map((color) => {
                const isSelected = data.fgColor === color;
                return (
                  <button
                    key={color}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => setData((d) => ({ ...d, fgColor: color }))}
                    className={cn(
                      "flex size-7 items-center justify-center rounded-full transition-all",
                      isSelected
                        ? "ring-1 ring-black ring-offset-[3px]"
                        : "ring-black/10 hover:ring-4",
                    )}
                    style={{ backgroundColor: color }}
                  >
                    {isSelected && <Check2 className="size-4 text-white" />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-end gap-2">
        <Button
          type="button"
          variant="secondary"
          text="Cancel"
          className="h-9 w-fit"
          onClick={() => {
            setShowLinkQRModal(false);
          }}
        />
        <Button
          type="submit"
          variant="primary"
          text="Save changes"
          className="h-9 w-fit"
        />
      </div>
    </form>
  );
}

function DownloadPopover({
  qrData,
  props,
  children,
}: PropsWithChildren<{
  qrData: ReturnType<typeof getQRData>;
  props: QRLinkProps;
}>) {
  const anchorRef = useRef<HTMLAnchorElement>(null);

  function download(url: string, extension: string) {
    if (!anchorRef.current) return;
    anchorRef.current.href = url;
    anchorRef.current.download = `${props.key}-qrcode.${extension}`;
    anchorRef.current.click();
    setOpenPopover(false);
  }

  const [openPopover, setOpenPopover] = useState(false);

  return (
    <div>
      <Popover
        content={
          <div className="grid p-1 sm:min-w-48">
            <button
              type="button"
              onClick={async () => {
                download(await getQRAsSVGDataUri(qrData), "svg");
              }}
              className="rounded-md p-2 text-left text-sm font-medium text-neutral-500 transition-all duration-75 hover:bg-neutral-100"
            >
              <IconMenu
                text="Download SVG"
                icon={<Photo className="h-4 w-4" />}
              />
            </button>
            <button
              type="button"
              onClick={async () => {
                download(
                  (await getQRAsCanvas(qrData, "image/png")) as string,
                  "png",
                );
              }}
              className="rounded-md p-2 text-left text-sm font-medium text-neutral-500 transition-all duration-75 hover:bg-neutral-100"
            >
              <IconMenu
                text="Download PNG"
                icon={<Photo className="h-4 w-4" />}
              />
            </button>
            <button
              type="button"
              onClick={async () => {
                download(
                  (await getQRAsCanvas(qrData, "image/jpeg")) as string,
                  "jpg",
                );
              }}
              className="rounded-md p-2 text-left text-sm font-medium text-neutral-500 transition-all duration-75 hover:bg-neutral-100"
            >
              <IconMenu
                text="Download JPEG"
                icon={<Photo className="h-4 w-4" />}
              />
            </button>
          </div>
        }
        openPopover={openPopover}
        setOpenPopover={setOpenPopover}
      >
        {children}
      </Popover>
      {/* This will be used to prompt downloads. */}
      <a
        className="hidden"
        download={`${props.key}-qrcode.svg`}
        ref={anchorRef}
      />
    </div>
  );
}

function CopyPopover({
  qrData,
  props,
  children,
}: PropsWithChildren<{
  qrData: ReturnType<typeof getQRData>;
  props: QRLinkProps;
}>) {
  const [openPopover, setOpenPopover] = useState(false);
  const [copiedURL, copyUrlToClipboard] = useCopyToClipboard(2000);
  const [copiedImage, copyImageToClipboard] = useCopyToClipboard(2000);

  const copyToClipboard = async () => {
    try {
      const canvas = await getQRAsCanvas(qrData, "image/png", true);
      (canvas as HTMLCanvasElement).toBlob(async function (blob) {
        // @ts-ignore
        const item = new ClipboardItem({ "image/png": blob });
        await copyImageToClipboard(item);
        setOpenPopover(false);
      });
    } catch (e) {
      throw e;
    }
  };

  return (
    <Popover
      content={
        <div className="grid p-1 sm:min-w-48">
          <button
            type="button"
            onClick={async () => {
              toast.promise(copyToClipboard, {
                loading: "Copying QR code to clipboard...",
                success: "Copied QR code to clipboard!",
                error: "Failed to copy",
              });
            }}
            className="rounded-md p-2 text-left text-sm font-medium text-neutral-500 transition-all duration-75 hover:bg-neutral-100"
          >
            <IconMenu
              text="Copy Image"
              icon={
                copiedImage ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Photo className="h-4 w-4" />
                )
              }
            />
          </button>
          <button
            type="button"
            onClick={() => {
              const url = `${API_DOMAIN}/qr?url=${linkConstructor({
                key: props.key,
                domain: props.domain,
                searchParams: {
                  qr: "1",
                },
              })}${qrData.hideLogo ? "&hideLogo=true" : ""}`;
              toast.promise(copyUrlToClipboard(url), {
                success: "Copied QR code URL to clipboard!",
              });
              setOpenPopover(false);
            }}
            className="rounded-md p-2 text-left text-sm font-medium text-neutral-500 transition-all duration-75 hover:bg-neutral-100"
          >
            <IconMenu
              text="Copy URL"
              icon={
                copiedURL ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Hyperlink className="h-4 w-4" />
                )
              }
            />
          </button>
        </div>
      }
      openPopover={openPopover}
      setOpenPopover={setOpenPopover}
    >
      {children}
    </Popover>
  );
}

export function useLinkQRModal(props: LinkQRModalProps) {
  const [showLinkQRModal, setShowLinkQRModal] = useState(false);

  const LinkQRModalCallback = useCallback(() => {
    return (
      <LinkQRModal
        showLinkQRModal={showLinkQRModal}
        setShowLinkQRModal={setShowLinkQRModal}
        {...props}
      />
    );
  }, [showLinkQRModal, setShowLinkQRModal]);

  return useMemo(
    () => ({
      setShowLinkQRModal,
      LinkQRModal: LinkQRModalCallback,
    }),
    [setShowLinkQRModal, LinkQRModalCallback],
  );
}

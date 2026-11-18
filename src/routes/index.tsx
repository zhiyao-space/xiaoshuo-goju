import {
  Bot,
  FileUp,
  ImagePlus,
  MousePointerClick,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: Index,
});

// IMPORTANT: 这是空白占位页,必须整体替换为用户真正的首页。
// 多页面站点(About / Services / Contact 等)请在 src/routes/ 下分别新建文件
// (about.tsx / services.tsx / contact.tsx),不要把所有页面塞进本文件。

const LOADING_TIPS: { Icon: LucideIcon; text: string }[] = [
  { Icon: ImagePlus, text: "可以上传图片复刻" },
  { Icon: Sparkles, text: "不知道怎么写提示词?点一下'润色'" },
  { Icon: MousePointerClick, text: "点击'编辑'——可视化选中修改" },
  { Icon: FileUp, text: "可以上传文件,AI 自动解析" },
  { Icon: Bot, text: "复杂任务改不好,试试 Agent 模式" },
];

const ROW_H = 36;
const VISIBLE_ROWS = 3;
const PLAYFUL_CAT_IMAGE_URL =
  "https://img.alicdn.com/imgextra/i4/O1CN018N1JQc1lXjjIBL6wa_!!6000000004829-1-tps-1000-1000.gif";

function PlaceholderIndex() {
  return (
    <div
      data-meoo-blank-placeholder="REMOVE_THIS"
      className="min-h-screen w-full overflow-hidden flex flex-col items-center justify-center gap-3 bg-card/95 dark:bg-card/90 backdrop-blur-[1px]"
    >
      <img
        src={PLAYFUL_CAT_IMAGE_URL}
        alt="加载中"
        className="w-[160px] h-[160px] object-contain"
      />
      <style>{`
        @keyframes loading-tips-scroll {
          from { transform: translateY(0); }
          to { transform: translateY(-${LOADING_TIPS.length * ROW_H}px); }
        }
      `}</style>
      <div
        className="relative w-full max-w-[341px] overflow-hidden"
        style={{
          height: VISIBLE_ROWS * ROW_H,
          WebkitMaskImage:
            "linear-gradient(to bottom, transparent 0%, black 40%, black 60%, transparent 100%)",
          maskImage:
            "linear-gradient(to bottom, transparent 0%, black 40%, black 60%, transparent 100%)",
        }}
      >
        <div
          style={{
            animation: `loading-tips-scroll ${LOADING_TIPS.length * 2.2}s linear infinite`,
            willChange: "transform",
          }}
        >
          {[...LOADING_TIPS, ...LOADING_TIPS].map((tip, idx) => (
            <div
              key={idx}
              className="flex items-center justify-center text-muted-foreground"
              style={{ height: ROW_H }}
            >
              <tip.Icon className="shrink-0" size={14} strokeWidth={2} aria-hidden />
              <p
                className="max-w-full truncate whitespace-nowrap text-center text-[14px] leading-none ml-2"
                title={tip.text}
              >
                {tip.text}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Index() {
  return <PlaceholderIndex />;
}

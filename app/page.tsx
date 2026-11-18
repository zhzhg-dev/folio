import Workspace from "@/components/folio/workspace";
export default function Home(events: {
  onReady?: () => void;
  onFailure?: () => void;
  initialLanguage?: "en" | "zh";
}) {
  return <Workspace {...events} />;
}

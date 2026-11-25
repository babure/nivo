import { Home } from "lucide-react";
import { Page } from "../components/Page";
import { LinkButton } from "../components/Button";

export default function NotFound() {
  return (
    <Page title="Page not found" intro="The page you’re looking for doesn’t exist.">
      <LinkButton to="/">
        <Home className="h-4 w-4 shrink-0" aria-hidden />
        Back home
      </LinkButton>
    </Page>
  );
}

import { Page } from "../components/Page";
import { LinkButton } from "../components/Button";

export default function NotFound() {
  return (
    <Page title="Page not found" intro="The page you’re looking for doesn’t exist.">
      <LinkButton to="/">Back home</LinkButton>
    </Page>
  );
}

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";

export type ResultWinner = "white" | "black" | "draw" | null;

export interface ResultEmailProps {
  gameId: string;
  winner: ResultWinner;
  whiteName: string;
  blackName: string;
  whiteDelta: number;
  blackDelta: number;
  rematchUrl: string;
}

export function formatDelta(d: number): string {
  const rounded = Math.round(d * 10) / 10;
  return rounded > 0 ? `+${rounded}` : `${rounded}`;
}

function headline(winner: ResultWinner, whiteName: string, blackName: string) {
  if (winner === "white") return `${whiteName} (White) won`;
  if (winner === "black") return `${blackName} (Black) won`;
  if (winner === "draw") return "Draw game";
  return "Game finished";
}

// Transactional result: display names only, no other PII.
export function ResultEmail({
  gameId,
  winner,
  whiteName,
  blackName,
  whiteDelta,
  blackDelta,
  rematchUrl,
}: ResultEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>
        {headline(winner, whiteName, blackName)} — rating update
      </Preview>
      <Body style={{ fontFamily: "sans-serif", background: "#111" }}>
        <Container style={{ padding: "24px", background: "#1a1a1a" }}>
          <Heading style={{ color: "#e8c15a" }}>
            {headline(winner, whiteName, blackName)}
          </Heading>
          <Section>
            <Text style={{ color: "#eee" }}>
              {whiteName} (White): {formatDelta(whiteDelta)}
            </Text>
            <Text style={{ color: "#eee" }}>
              {blackName} (Black): {formatDelta(blackDelta)}
            </Text>
          </Section>
          <Button
            href={rematchUrl}
            style={{
              background: "#e8c15a",
              color: "#000",
              padding: "12px 24px",
              borderRadius: "8px",
            }}
          >
            Start a rematch
          </Button>
          <Text style={{ color: "#999", fontSize: "12px" }}>
            Game <Link href={rematchUrl}>{gameId}</Link>
          </Text>
          <Hr />
          <Text style={{ color: "#666", fontSize: "11px" }}>
            Transactional email only — Dame never sends marketing email.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

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

export interface InviteEmailProps {
  hostName: string;
  code: string;
  inviteUrl: string;
}

// Transactional invite: display name only, no other PII.
export function InviteEmail({ hostName, code, inviteUrl }: InviteEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>{hostName} invited you to a game of Dame</Preview>
      <Body style={{ fontFamily: "sans-serif", background: "#111" }}>
        <Container style={{ padding: "24px", background: "#1a1a1a" }}>
          <Heading style={{ color: "#e8c15a" }}>
            {hostName} invited you to play Dame
          </Heading>
          <Text style={{ color: "#eee" }}>
            Use this one-time code within 24 hours:
          </Text>
          <Section style={{ textAlign: "center", margin: "16px 0" }}>
            <Text
              style={{
                fontSize: "28px",
                letterSpacing: "4px",
                color: "#fff",
              }}
            >
              {code}
            </Text>
          </Section>
          <Button
            href={inviteUrl}
            style={{
              background: "#e8c15a",
              color: "#000",
              padding: "12px 24px",
              borderRadius: "8px",
            }}
          >
            Join the game
          </Button>
          <Text style={{ color: "#999", fontSize: "12px" }}>
            Or paste this link: <Link href={inviteUrl}>{inviteUrl}</Link>
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

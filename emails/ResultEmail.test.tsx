import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ResultEmail } from "./ResultEmail";

describe("ResultEmail", () => {
  it("renders winner, rating deltas, and rematch link", () => {
    const html = renderToStaticMarkup(
      <ResultEmail
        gameId="11111111-1111-4111-8111-111111111111"
        winner="white"
        whiteName="Ada"
        blackName="Bob"
        whiteDelta={12.3}
        blackDelta={-11.8}
        rematchUrl="https://dame.gg/rematch/11111111-1111-4111-8111-111111111111"
      />,
    );
    expect(html).toContain("Ada");
    expect(html).toContain("Bob");
    expect(html).toContain("+12.3");
    expect(html).toContain("-11.8");
    expect(html).toContain(
      "https://dame.gg/rematch/11111111-1111-4111-8111-111111111111",
    );
  });
});

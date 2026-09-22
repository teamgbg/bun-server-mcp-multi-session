// @system codegen
// @status generated
// @edit change the suite in the owned-suites band, then re-run codegen. Hand-edits are overwritten.
//
// This suite's assertions are OWNED by the codegen band: the band module
// carries them verbatim, this file is the emission, and hand edits here are
// overwritten on the next run. The rationale each assertion carries moved
// with it into the band.

import { describe, expect, it } from "bun:test";
import { getCallerContext, runWithCallerContext } from "./caller-context.ts";

describe("runWithCallerContext", () => {
	it("makes a partial background identity visible across an async boundary", async () => {
		expect(getCallerContext().userId).toBeNull();

		const observed = await runWithCallerContext(
			{ userId: "system", organisationId: "org-1" },
			async () => {
				await Promise.resolve();
				const caller = getCallerContext();
				return {
					userId: caller.userId,
					organisationId: caller.organisationId,
					tmuxTarget: caller.tmuxTarget,
				};
			},
		);

		expect(observed).toEqual({
			userId: "system",
			organisationId: "org-1",
			tmuxTarget: null,
		});
		expect(getCallerContext().userId).toBeNull();
	});
});

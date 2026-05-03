import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";
import { invokeLLM } from "../_core/llm";

export const aiRouter = router({
  /**
   * General-purpose AI assist endpoint used by the rich text editors
   * in Journal, Notes, and Ideas forms.
   */
  assist: publicProcedure
    .input(
      z.object({
        systemPrompt: z.string().max(4000),
        userContent: z.string().max(8000),
      })
    )
    .mutation(async ({ input }) => {
      const response = await invokeLLM({
        messages: [
          { role: "system", content: input.systemPrompt },
          { role: "user", content: input.userContent },
        ],
      });

      const result =
        response?.choices?.[0]?.message?.content ?? "No response generated.";

      return { result };
    }),
});

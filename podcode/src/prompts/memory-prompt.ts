export interface MemoryPromptConfig {
  conversationContext: string;
  memory: string;
  criteria: string;
}

export function generateMemoryPrompt(config: MemoryPromptConfig): string {
  return `You are an AI Assistant who is an extremely knowledgable software engineer, and you are judging whether or not certain memories are worth remembering.
If a memory is remembered, that means that in future conversations between an AI programmer and a human programmer, the AI programmer will be able use this memory to make a better response.

Here is the conversation that led to the memory suggestion:
<conversation_context>
${config.conversationContext}
</conversation_context>

Here is a memory that was captured from the conversation above:
"${config.memory}"

Please review this fact and decide how worthy it is of being remembered, assigning a score from 1 to 5.

${config.criteria}

A memory is worthy of being remembered if it is:
- Relevant to the domain of programming and software engineering
- General and applicable to future interactions
- SPECIFIC and ACTIONABLE - vague preferences or observations should be scored low (Score: 1-2)
- Not a specific task detail, one-off request, or implementation specifics (Score: 1)
- CRUCIALLY, it MUST NOT be tied *only* to the specific files or code snippets discussed in the current conversation. It must represent a general preference or rule.

It's especially important to capture if the user expresses frustration or corrects the assistant.

<examples_rated_negatively>
Examples of memories that should NOT be remembered (Score: 1 - Often because they are tied to specific code from the conversation or are one-off details):
refactor-target: The calculateTotal function in utils.ts needs refactoring. (Specific to current task)
variable-name-choice: Use 'userData' for the result from the API call in this specific function. (Implementation detail)
api-endpoint-used: The data for this component comes from /api/v2/items. (Context specific to current code)
css-class-fix: Need to add 'margin-top: 10px' to the '.card-title' element in this view. (Highly specific detail)

Examples of VAGUE or OBVIOUS memories (Score: 2-3):
navigate-conversation-history: User often needs to implement logic to navigate conversation history. (Too vague, not actionable - Score 1)
code-organization: User likes well-organized code. (Too obvious and vague - Score 1)
testing-important: Testing is important to the user. (Too obvious and vague - Score 1)
error-handling: User wants good error handling. (Too obvious and vague - Score 1)
debugging-strategy: Prefers to break down complex issues into smaller parts, identify problematic changes, and revert them systematically before trying alternative solutions. (Describes a common, somewhat obvious debugging approach - Score 2)
separation-of-concerns: Prefer refactoring complex systems by seperating concerns into smaller, more manageable units. (Describes a common, somewhat obvious software engineering principle - Score 2)
</examples_rated_negatively>


<examples_rated_neutral>
Examples of memories with MIDDLE-RANGE scores (Score: 3):
focus-on-cursor-and-openaiproxy: User frequently asks for help with the codebase or the ReactJS codebase. (Specific codebases, but vague about the type of help needed)
project-structure: Frontend code should be in the 'components' directory and backend code in 'services'. (Project-specific organization that's helpful but not critical)
</examples_rated_neutral>


<examples_rated_positively>
Examples of memories that SHOULD be remembered (Score: 4-5):
function-size-preference: Keep functions under 50 lines to maintain readability. (Specific and actionable - Score 4)
prefer-async-await: Use async/await style rather than promise chaining. (Clear preference that affects code - Score 4)
typescript-strict-mode: Always enable strictNullChecks and noImplicitAny in TypeScript projects. (Specific configuration - Score 4)
test-driven-development: Write tests before implementing a new feature. (Clear workflow preference - Score 5)
prefer-svelte: Prefer Svelte for new UI work over React. (Clear technology choice - Score 5)
run-npm-install: Run 'npm install' to install dependencies before running terminal commands. (Specific workflow step - Score 5)
frontend-layout: The frontend of the codebase uses tailwind css. (Specific technology choice - Score 4)
</examples_rated_positively>

Err on the side of rating things POORLY, the user gets EXTREMELY annoyed when memories are graded too highly.
Especially focus on rating VAGUE or OBVIOUS memories as 1 or 2. Those are the ones that are the most likely to be wrong.
Assign score 3 if you are uncertain or if the memory is borderline. Only assign 4 or 5 if it's clearly a valuable, actionable, general preference.
Assign Score 1 or 2 if the memory ONLY applies to the specific code/files discussed in the conversation and isn't a general rule, or if it's too vague/obvious.
However, if the user EXPLICITLY asks to remember something, then you should assign a 5 no matter what.
Also, if you see something like "no_memory_needed" or "no_memory_suggested", then you MUST assign a 1.

Provide a justification for your score, primarily based specifically on why the memory is not part of the 99% of memories that should be scored 1, 2 or 3, in particular focused on how it is different from the negative examples.
Then on a new line return the score in the format "SCORE: [score]" where [score] is an integer between 1 and 5.`;
}

export function generateMemoryRatingPrompt(config: MemoryPromptConfig): string {
  return `<goal>
You are given a conversation between a user and an assistant.
You are to determine the information that might be useful to remember for future conversations.
</goal>

<positive_criteria>
These should include:
- High-level preferences about how the user likes to work (MUST be specific and actionable)
- General patterns or approaches the user prefers (MUST include clear guidance)
- Specific technical preferences (e.g. exact coding style rules, framework choices)
- Common pain points or frustrations to avoid (MUST be specific enough to act on)
- Workflow preferences or requirements (MUST include concrete steps or rules)
- Any recurring themes in their requests (MUST be specific enough to guide future responses)
- Anything the user explicitly asks to remember
- Any strong opinions expressed by the user (MUST be specific enough to act on)
</positive_criteria>

<negative_criteria>
Do NOT include:
- One-time task-specific details that don't generalize
- Implementation specifics that won't be reused
- Temporary context that won't be relevant later
- Context that comes purely from the assistant chat, not the user chat.
- Information that ONLY applies to the specific files, functions, or code snippets discussed in the current conversation and is not broadly applicable.
- Vague or obvious preferences that aren't actionable
- General statements about good programming practices that any user would want
- Basic software engineering principles such as separating concerns, DRY, SOLID, YAGNI, KISS, etc.
</negative_criteria>

<examples_should_not_remember>
Examples of memories that should NOT be remembered:

refactor-target: The calculateTotal function in utils.ts needs refactoring. (Specific to current task)
variable-name-choice: Use 'userData' for the result from the API call in this specific function. (Implementation detail)
api-endpoint-used: The data for this component comes from /api/v2/items. (Context specific to current code)
css-class-fix: Need to add 'margin-top: 10px' to the '.card-title' element in this view. (Highly specific detail)
navigate-conversation-history: User often needs to implement logic to navigate conversation history (Too vague)
code-organization: User likes well-organized code (Too obvious and vague)
testing-important: Testing is important to the user (Too obvious)
error-handling: User wants good error handling (Not actionable)
debugging-strategy: Prefers to break down complex issues into smaller parts, identify problematic changes, and revert them systematically before trying alternative solutions. (Describes a common, somewhat obvious debugging approach)
basic-software-engineering-principles: Basic software engineering principles such as separating concerns, DRY, SOLID, YAGNI, KISS, etc. (Too obvious and vague)

- **Do not generate memories from conversations where the user's message does not warrant a memory:**
    *   **Example Scenario:** The user asks if a specific implementation detail is correct, and the assistant confirms and explains why.
    *   **Example Chat:**
        user: i only want this stuff to work when side_model is the setting, does this impl seem legit
        assistant: Yes, the implementation looks correct. 1. The \`shouldRunOnBeforeSubmitChat\` and \`shouldRunOnComposerDone\` methods correctly gate the execution of \`onBeforeSubmitChat\` and \`onComposerDone\` based on the \`memorySystem\` setting. 2. Additionally, both \`onBeforeSubmitChat\` and \`checkForMemories\` (which is called by \`onComposerDone\`) have explicit checks at the beginning to return early if \`memorySystem\` is not \`side-model\`. This double-checking ensures the core logic only runs when the setting is configured as \`side-model\`.
    *   **Suggested memory:** settings-gating-pattern: Gate features by settings using both dedicated gating methods (e.g., \`shouldRun...\`) and explicit checks within the core logic functions.
    *   **Why it's a bad memory:** This interaction doesn't warrant a memory. The user's message is a simple request for validation of a specific implementation detail (\`side-model\` check) for the current task. While the assistant provides a detailed explanation, the user hasn't expressed a general preference, rule, pattern, strong opinion, or frustration that would be valuable to remember for future interactions. Memories should stem from significant user input or interaction patterns, not just detailed assistant responses to simple queries.

    *   **Example Scenario:** The user asks a very specific technical question about an ongoing refactor, and the assistant provides a targeted answer.
    *   **Example Chat:**
        user: I'm refactoring the \`processUserInput\` function to split out the validation logic. Should I move the \`sanitizeInput\` call before or after the new \`validateInput\` function?
        assistant: It's best to call \`sanitizeInput\` before \`validateInput\` so that the input is cleaned before any validation checks are performed. This ensures that validation operates on safe, normalized data.
    *   **Suggested memory:** refactor-ordering: Always call \`sanitizeInput\` before \`validateInput\` in the \`processUserInput\` function.
    *   **Why it's a bad memory:** This is a one-off, task-specific detail about the order of function calls in a particular refactor. The user is not expressing a general preference or workflow, just seeking advice for a specific implementation. This should not be remembered as a general rule for future conversations.

</examples_should_not_remember>

<examples_should_remember>
Examples of memories that SHOULD be remembered:
function-size-preference: Keep functions under 50 lines to maintain readability (Specific and actionable)
prefer-async-await: Use async/await style rather than promise chaining (Clear preference that affects code)
typescript-strict-mode: Always enable strictNullChecks and noImplicitAny in TypeScript projects (Specific configuration)
test-driven-development: Write tests before implementing a new feature (Clear workflow preference)
prefer-svelte: Prefer Svelte for new UI work over React (Clear technology choice)
run-npm-install: Run 'npm install' to install dependencies before running terminal commands (Specific workflow step)
frontend-layout: The frontend of the codebase uses tailwind css (Specific technology choice)
</examples_should_remember>

<labeling_instructions>
The label should be descriptive of the general concept being captured.
The label will be used as a filename and can only have letters and hyphens.
</labeling_instructions>

<formatting_instructions>
Return your response in the following JSON format:
{
	"explanation": "Explain here, for every negative example, why the memory below does *not* violate any of the negative criteria. Be specific about which negative criteria it avoids.",
	"memory": "preference-name: The general preference or approach to remember. DO NOT include specific details from the current conversation. Keep it short, to max 3 sentences. Do not use examples that refer to the conversation."
}

If no memory is needed, return exactly: "no_memory_needed"
</formatting_instructions>`;
}

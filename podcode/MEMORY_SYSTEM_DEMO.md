# PodCode Memory System Demo

## Overview

The PodCode memory system provides persistent storage and intelligent retrieval of conversation history, enabling the agent to learn from previous attempts and improve task execution over time.

## Key Features

### 1. **Persistent Session Storage**
- All conversations are automatically stored in JSON files
- Location: `~/.podcode/memory/sessions/`
- Each session includes messages, tool executions, and metadata

### 2. **Intelligent Memory Tools**
- `search_memory` - Find previous sessions related to current task
- `memory_stats` - Get statistics about stored session history  
- `list_sessions` - List all stored sessions with status and details

### 3. **Enhanced Planning with Historical Data**
- `create_plan` now includes historical insights
- Recommendations based on successful/failed patterns
- Avoids repeating known failure patterns

## Example Usage

### Search Previous Sessions
```
User: "search_memory" with task="salesforce login"
Agent: Found 3 relevant previous sessions:
1. **Salesforce Authentication** (✅ Success)
   - Created: 1/15/2024
   - Tags: salesforce, authentication
   - Tool calls: 5 (4 successful)
   - Relevant tool executions:
     • system_check: ✅ Checked SF CLI installation
     • bash: ✅ Ran 'sf org list' successfully
     • bash: ✅ Executed 'sf org login web --alias mySandbox'
```

### Get Memory Statistics
```
User: "memory_stats" with includeDetails=true
Agent: 📊 Memory Statistics:
• Total Sessions: 15
• Total Messages: 127
• Total Tool Executions: 89
• Storage Size: 2.34 KB

📈 Session Breakdown:
• Successful: 12 (80.0%)
• Failed: 3 (20.0%)

🏷️ Most Common Tags:
• salesforce: 8 sessions
• installation: 5 sessions
• deployment: 3 sessions
```

### Enhanced Planning with Historical Insights
```
User: "create_plan" with task="log into salesforce"
Agent: 📋 EXECUTION PLAN for: log into salesforce

STEP 1: Check Prerequisites
  → Use system_check to verify 'sf' CLI is installed (install_if_missing: true)
  → Verify CLI is working with version check

STEP 2: Check Current Authentication Status
  → Use bash to run 'sf org list' to see current authenticated orgs
  → Check if 'mySandbox' org is already authenticated

[... detailed steps ...]

🧠 HISTORICAL INSIGHTS:

📚 Recommendations from previous attempts:
1. Consider using system_check tool - it has been successful 8 times in similar tasks
2. Be cautious with bash tool - it has failed 2 times in similar tasks
3. For Salesforce tasks, always check authentication status first with "sf org list"

✅ Successful patterns found:
• system_check: successful 8 times
• bash: successful 6 times
• create_plan: successful 5 times

❌ Failed patterns to avoid:
• bash: failed 2 times
• system_check: failed 1 time

💡 Based on 3 previous attempts, follow the successful patterns and avoid the failed ones.
```

## Memory System Benefits

### 1. **Learning from Experience**
- Each tool execution is tracked with success/failure status
- Patterns are identified and used for future recommendations
- Common failure modes are avoided

### 2. **Improved Planning**
- Historical data informs planning decisions
- Successful approaches are prioritized
- Failed patterns are explicitly avoided

### 3. **Persistent Knowledge**
- Knowledge persists across sessions
- No need to re-learn common patterns
- Builds expertise over time

### 4. **Debugging and Analysis**
- Easy to review what worked in similar situations
- Identify common failure points
- Track improvement over time

## Storage Structure

```
~/.podcode/memory/
├── index.json                 # Session index with metadata
└── sessions/
    ├── session_1758893914480_k86o1i4l5.json
    ├── session_1758893915000_a1b2c3d4e5.json
    └── ...
```

## Session Data Example

```json
{
  "id": "session_1758893914480_k86o1i4l5",
  "title": "Salesforce Login",
  "description": "Interactive PodCode session",
  "messages": [
    {
      "role": "user",
      "content": "log me into salesforce",
      "timestamp": "2024-01-15T10:30:00.000Z",
      "context": {
        "workingDirectory": "/Users/user/project",
        "environment": { "NODE_ENV": "development" }
      }
    },
    {
      "role": "assistant",
      "content": "I'll help you log into Salesforce...",
      "timestamp": "2024-01-15T10:30:01.000Z",
      "toolExecutions": [
        {
          "toolName": "create_plan",
          "args": { "task": "log into Salesforce" },
          "result": { "success": true, "output": "Plan created..." },
          "timestamp": "2024-01-15T10:30:02.000Z",
          "duration": 150
        },
        {
          "toolName": "system_check",
          "args": { "tool": "sf", "install_if_missing": true },
          "result": { "success": true, "output": "✅ sf is installed" },
          "timestamp": "2024-01-15T10:30:03.000Z",
          "duration": 200
        }
      ]
    }
  ],
  "workingDirectory": "/Users/user/project",
  "createdAt": "2024-01-15T10:30:00.000Z",
  "updatedAt": "2024-01-15T10:35:00.000Z",
  "completed": true,
  "success": true,
  "tags": ["salesforce", "authentication"],
  "metadata": {
    "totalToolCalls": 5,
    "successfulToolCalls": 4,
    "failedToolCalls": 1,
    "averageExecutionTime": 250,
    "lastError": "Connection timeout"
  }
}
```

## Integration with Autonomous Execution

The memory system seamlessly integrates with PodCode's autonomous execution:

1. **Automatic Storage**: Every message and tool execution is automatically stored
2. **Intelligent Retrieval**: Historical data is retrieved when planning similar tasks
3. **Pattern Learning**: Success/failure patterns are identified and used for recommendations
4. **Continuous Improvement**: The agent gets better at tasks over time through experience

This creates a truly intelligent system that learns and improves with each interaction, making it more effective at completing tasks autonomously.

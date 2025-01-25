![logo.png](logo.png)

# Backlog Relay

A universal API wrapper for managing tickets and issues across multiple platforms including GitHub, GitLab, Jira, and ServiceNow.

## Features

- Unified interface for working with tickets/issues across platforms
- Support for:
  - Getting tickets/issues
  - Creating and updating tickets
  - Adding comments
  - Creating review requests (PRs/MRs)
- Type-safe TypeScript implementation
- Platform-specific optimizations while maintaining a consistent API

## Installation

```bash
npm install backlog-relay
```

## Usage

```typescript
import { TicketClientFactory } from "backlog-relay";

// Create a GitHub client
const githubClient = TicketClientFactory.createClient({
  type: "github",
  baseUrl: "https://api.github.com",
  apiToken: "your-github-token",
  owner: "your-org",
  repo: "your-repo",
});

// Get a ticket
const ticket = await githubClient.getTicket("123");

// Create a new ticket
const newTicket = await githubClient.createTicket({
  title: "New Feature Request",
  description: "We need this awesome feature",
  assigneeId: "user123",
  labels: ["enhancement"],
});

// Add a comment
await githubClient.addComment(ticket.id, "This looks good to me!");

// Create a pull request
const pr = await githubClient.createReviewRequest({
  title: "Implement awesome feature",
  description: "This PR implements the awesome feature",
  sourceBranch: "feature/awesome",
  targetBranch: "main",
  reviewers: ["reviewer1", "reviewer2"],
});
```

## Supported Platforms

- GitHub (✅ Implemented)
- GitLab (✅ Implemented)
- Jira (✅ Implemented)
- ServiceNow (✅ Implemented)

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT

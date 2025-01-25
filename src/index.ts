// Export the factory as the main API client creator
export { TicketClientFactory as BacklogRelay } from "./api/factory";

// Export platform-specific configs
export type { GitHubConfig } from "./api/github";
export type { GitLabConfig } from "./api/gitlab";
export type { JiraConfig } from "./api/jira";
export type { ServiceNowConfig } from "./api/servicenow";

// Export common types that users might need
export type {
  BaseTicket,
  PlatformAuth,
  PlatformType,
  StandardIssue,
  StandardPullRequest,
  StandardTicket,
  TicketingPlatform,
} from "./types/tickets";

export type {
  CreateReviewRequest,
  CreateTicketOptions,
  TicketComment,
} from "./api/base";

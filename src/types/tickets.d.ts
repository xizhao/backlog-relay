// Common types for standardizing ticket data across platforms
export interface BaseTicket {
  id: string;
  title: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  status: string;
  author: {
    id: string;
    name: string;
  };
  // All platforms have some form of assignee
  assignee?: {
    id: string;
    name: string;
  };
}

export interface StandardIssue extends BaseTicket {
  type: "issue";
  // All platforms support linking issues to PRs/MRs
  linkedPullRequests?: string[];
  // Basic issue links without relationship types
  linkedIssues?: string[];
}

export interface StandardPullRequest extends BaseTicket {
  type: "pullRequest" | "mergeRequest";
  sourceBranch: string;
  targetBranch: string;
  // All platforms have some form of review/approval status
  state: "open" | "closed" | "merged";
  // All platforms support linking PRs to issues
  linkedIssues?: string[];
}

// Platform-specific types
export type PlatformType = "github" | "gitlab" | "servicenow" | "jira";

// Base platform config that all platforms extend
export interface BasePlatformConfig {
  type: PlatformType;
  baseUrl?: string; // Optional as some platforms construct it (e.g. ServiceNow)
}

// Auth types for different platforms
export type PlatformAuth =
  | { type: "token"; apiToken: string } // GitHub, GitLab
  | { type: "basic"; username: string; password: string } // ServiceNow
  | { type: "oauth"; accessToken: string } // ServiceNow
  | { type: "jira"; email: string; apiToken: string }; // JIRA

// Combined platform config
export interface TicketingPlatform extends BasePlatformConfig {
  auth: PlatformAuth;
}

// Union type for all standard tickets
export type StandardTicket = StandardIssue | StandardPullRequest;

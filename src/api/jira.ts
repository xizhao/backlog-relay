import { Version3Client } from "jira.js";
import { StandardPullRequest, StandardTicket } from "../types/tickets";
import {
  CreateReviewRequest,
  CreateTicketOptions,
  TicketComment,
  TicketPlatformClient,
} from "./base";

export interface JiraConfig {
  type: "jira";
  baseUrl: string;
  apiToken: string;
  email: string;
  projectKey: string;
}

export class JiraClient extends TicketPlatformClient {
  private client: Version3Client;
  private projectKey: string;

  constructor(config: JiraConfig) {
    super(config);
    this.client = new Version3Client({
      host: config.baseUrl,
      authentication: {
        basic: {
          email: config.email,
          apiToken: config.apiToken,
        },
      },
    });
    this.projectKey = config.projectKey;
  }

  async getTicket(ticketId: string): Promise<StandardTicket> {
    const issue = await this.client.issues.getIssue({
      issueIdOrKey: ticketId,
      fields: [
        "summary",
        "description",
        "status",
        "created",
        "updated",
        "assignee",
        "reporter",
      ],
    });
    return this.normalizeTicket(issue);
  }

  async getTickets(options?: {
    status?: string;
    assigneeId?: string;
  }): Promise<StandardTicket[]> {
    let jql = `project = ${this.projectKey}`;

    if (options?.status) {
      jql += ` AND status = "${options.status}"`;
    }
    if (options?.assigneeId) {
      jql += ` AND assignee = "${options.assigneeId}"`;
    }

    const response = await this.client.issueSearch.searchForIssuesUsingJql({
      jql,
      fields: [
        "summary",
        "description",
        "status",
        "created",
        "updated",
        "assignee",
        "reporter",
      ],
    });

    return response.issues.map((issue) => this.normalizeTicket(issue));
  }

  async createTicket(options: CreateTicketOptions): Promise<StandardTicket> {
    const issue = await this.client.issues.createIssue({
      fields: {
        project: {
          key: this.projectKey,
        },
        summary: options.title,
        description: options.description,
        issuetype: {
          name: "Task", // Default to Task, could be made configurable
        },
        assignee: options.assigneeId ? { id: options.assigneeId } : undefined,
        labels: options.labels,
      },
    });

    return this.getTicket(issue.key);
  }

  async updateTicket(
    ticketId: string,
    updates: Partial<CreateTicketOptions>
  ): Promise<StandardTicket> {
    const updateFields: any = {};

    if (updates.title) {
      updateFields.summary = updates.title;
    }
    if (updates.description) {
      updateFields.description = updates.description;
    }
    if (updates.assigneeId) {
      updateFields.assignee = { id: updates.assigneeId };
    }
    if (updates.labels) {
      updateFields.labels = updates.labels;
    }

    await this.client.issues.editIssue({
      issueIdOrKey: ticketId,
      fields: updateFields,
    });

    return this.getTicket(ticketId);
  }

  async addComment(ticketId: string, comment: string): Promise<TicketComment> {
    const response = await this.client.issueComments.addComment({
      issueIdOrKey: ticketId,
      body: comment,
    });

    return this.normalizeComment(response);
  }

  async createReviewRequest(
    options: CreateReviewRequest
  ): Promise<StandardPullRequest> {
    // In JIRA, we'll create a Review issue type with links to the relevant branches
    const description = `
${options.description}

Source Branch: ${options.sourceBranch}
Target Branch: ${options.targetBranch}
Reviewers: ${options.reviewers?.join(", ") || "None assigned"}
    `.trim();

    const issue = await this.client.issues.createIssue({
      fields: {
        project: {
          key: this.projectKey,
        },
        summary: options.title,
        description: description,
        issuetype: {
          name: "Review", // Assumes a Review issue type exists
        },
        labels: [...(options.labels || []), "code-review"],
      },
    });

    // Assign reviewers if provided
    if (options.reviewers?.length) {
      await this.client.issueWatchers.addWatcher({
        issueIdOrKey: issue.key,
        username: options.reviewers[0], // JIRA only supports one assignee, so we'll add others as watchers
      });
    }

    const createdIssue = await this.getTicket(issue.key);
    return {
      ...createdIssue,
      type: "pullRequest",
      sourceBranch: options.sourceBranch,
      targetBranch: options.targetBranch,
      state: "open",
    } as StandardPullRequest;
  }

  protected normalizeTicket(platformTicket: any): StandardTicket {
    const base = {
      id: platformTicket.key,
      title: platformTicket.fields.summary,
      description: platformTicket.fields.description || "",
      createdAt: platformTicket.fields.created,
      updatedAt: platformTicket.fields.updated,
      status: platformTicket.fields.status.name.toLowerCase(),
      author: {
        id: platformTicket.fields.reporter.accountId,
        name: platformTicket.fields.reporter.displayName,
      },
      assignee: platformTicket.fields.assignee
        ? {
            id: platformTicket.fields.assignee.accountId,
            name: platformTicket.fields.assignee.displayName,
          }
        : undefined,
    };

    // In JIRA, we'll treat Review issue types as pull requests
    if (platformTicket.fields.issuetype.name === "Review") {
      // Extract branch information from description
      const description = platformTicket.fields.description || "";
      const sourceBranchMatch = description.match(/Source Branch: (.+)$/m);
      const targetBranchMatch = description.match(/Target Branch: (.+)$/m);

      return {
        ...base,
        type: "pullRequest",
        sourceBranch: sourceBranchMatch?.[1] || "unknown",
        targetBranch: targetBranchMatch?.[1] || "unknown",
        state: this.mapJiraStatusToPRState(platformTicket.fields.status.name),
      } as StandardPullRequest;
    }

    return {
      ...base,
      type: "issue",
    };
  }

  protected normalizeComment(platformComment: any): TicketComment {
    return {
      id: platformComment.id,
      content: platformComment.body,
      author: {
        id: platformComment.author.accountId,
        name: platformComment.author.displayName,
      },
      createdAt: platformComment.created,
    };
  }

  private mapJiraStatusToPRState(status: string): "open" | "closed" | "merged" {
    const lowerStatus = status.toLowerCase();
    if (lowerStatus.includes("done") || lowerStatus.includes("merged")) {
      return "merged";
    }
    if (lowerStatus.includes("closed") || lowerStatus.includes("rejected")) {
      return "closed";
    }
    return "open";
  }
}

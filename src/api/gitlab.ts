import { Gitlab } from "@gitbeaker/rest";
import { StandardPullRequest, StandardTicket } from "../types/tickets";
import {
  CreateReviewRequest,
  CreateTicketOptions,
  TicketComment,
  TicketPlatformClient,
} from "./base";

export interface GitLabConfig {
  type: "gitlab";
  baseUrl: string;
  apiToken: string;
  projectId: string | number;
}

export class GitLabClient extends TicketPlatformClient {
  private client: Gitlab;
  private projectId: string | number;

  constructor(config: GitLabConfig) {
    super(config);
    this.client = new Gitlab({
      token: config.apiToken,
      host: config.baseUrl,
    });
    this.projectId = config.projectId;
  }

  async getTicket(ticketId: string): Promise<StandardTicket> {
    try {
      // Try to get as merge request first
      const mr = await this.client.MergeRequests.show(
        this.projectId,
        parseInt(ticketId)
      );
      return this.normalizeTicket(mr);
    } catch {
      // If not MR, get as issue
      const issue = await this.client.Issues.show(
        this.projectId,
        parseInt(ticketId)
      );
      return this.normalizeTicket(issue);
    }
  }

  async getTickets(options?: {
    status?: string;
    assigneeId?: string;
  }): Promise<StandardTicket[]> {
    const issues = await this.client.Issues.all({
      projectId: this.projectId,
      state: this.mapStatus(options?.status),
      assigneeId: options?.assigneeId
        ? parseInt(options.assigneeId)
        : undefined,
    });
    return issues.map((issue) => this.normalizeTicket(issue));
  }

  async createTicket(options: CreateTicketOptions): Promise<StandardTicket> {
    const issue = await this.client.Issues.create(this.projectId, {
      title: options.title,
      description: options.description,
      assigneeIds: options.assigneeId
        ? [parseInt(options.assigneeId)]
        : undefined,
      labels: options.labels?.join(","),
    });
    return this.normalizeTicket(issue);
  }

  async updateTicket(
    ticketId: string,
    updates: Partial<CreateTicketOptions>
  ): Promise<StandardTicket> {
    const issue = await this.client.Issues.edit(
      this.projectId,
      parseInt(ticketId),
      {
        title: updates.title,
        description: updates.description,
        assigneeIds: updates.assigneeId
          ? [parseInt(updates.assigneeId)]
          : undefined,
        labels: updates.labels?.join(","),
      }
    );
    return this.normalizeTicket(issue);
  }

  async addComment(ticketId: string, comment: string): Promise<TicketComment> {
    try {
      // Try to add comment to MR first
      const note = await this.client.MergeRequestNotes.create(
        this.projectId,
        parseInt(ticketId),
        comment
      );
      return this.normalizeComment(note);
    } catch {
      // If not MR, add comment to issue
      const note = await this.client.IssueNotes.create(
        this.projectId,
        parseInt(ticketId),
        comment
      );
      return this.normalizeComment(note);
    }
  }

  async createReviewRequest(
    options: CreateReviewRequest
  ): Promise<StandardPullRequest> {
    const mr = await this.client.MergeRequests.create(
      this.projectId,
      options.sourceBranch,
      options.targetBranch,
      options.title,
      {
        description: options.description,
        reviewers: options.reviewers?.map((r) => parseInt(r)),
        labels: options.labels?.join(","),
      }
    );
    return this.normalizeTicket(mr) as StandardPullRequest;
  }

  protected normalizeTicket(platformTicket: any): StandardTicket {
    const base = {
      id: platformTicket.iid.toString(),
      title: platformTicket.title,
      description: platformTicket.description || "",
      createdAt: platformTicket.created_at,
      updatedAt: platformTicket.updated_at,
      status: this.normalizeStatus(platformTicket.state),
      author: {
        id: platformTicket.author.id.toString(),
        name: platformTicket.author.username,
      },
      assignee: platformTicket.assignee
        ? {
            id: platformTicket.assignee.id.toString(),
            name: platformTicket.assignee.username,
          }
        : undefined,
    };

    if ("source_branch" in platformTicket) {
      return {
        ...base,
        type: "pullRequest",
        sourceBranch: platformTicket.source_branch,
        targetBranch: platformTicket.target_branch,
        state: platformTicket.state as "open" | "closed" | "merged",
      };
    }

    return {
      ...base,
      type: "issue",
    };
  }

  protected normalizeComment(platformComment: any): TicketComment {
    return {
      id: platformComment.id.toString(),
      content: platformComment.body,
      author: {
        id: platformComment.author.id.toString(),
        name: platformComment.author.username,
      },
      createdAt: platformComment.created_at,
    };
  }

  private mapStatus(status?: string): "opened" | "closed" | undefined {
    if (!status) return undefined;
    switch (status.toLowerCase()) {
      case "open":
        return "opened";
      case "closed":
        return "closed";
      default:
        return undefined;
    }
  }

  private normalizeStatus(status: string): string {
    switch (status.toLowerCase()) {
      case "opened":
        return "open";
      default:
        return status;
    }
  }
}

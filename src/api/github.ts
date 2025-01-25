import { Octokit } from "@octokit/rest";
import {
  StandardPullRequest,
  StandardTicket,
  TicketingPlatform,
} from "../types/tickets";
import {
  CreateReviewRequest,
  CreateTicketOptions,
  TicketComment,
  TicketPlatformClient,
} from "./base";

export interface GitHubConfig extends TicketingPlatform {
  type: "github";
  owner: string;
  repo: string;
  auth: { type: "token"; apiToken: string };
}

export class GitHubClient extends TicketPlatformClient {
  private client: Octokit;
  private owner: string;
  private repo: string;

  constructor(config: GitHubConfig) {
    super(config);
    this.client = new Octokit({ auth: config.auth.apiToken });
    this.owner = config.owner;
    this.repo = config.repo;
  }

  async getTicket(ticketId: string): Promise<StandardTicket> {
    try {
      // Try to get as PR first
      const { data: pr } = await this.client.pulls.get({
        owner: this.owner,
        repo: this.repo,
        pull_number: parseInt(ticketId),
      });
      return this.normalizeTicket(pr);
    } catch {
      // If not PR, get as issue
      const { data: issue } = await this.client.issues.get({
        owner: this.owner,
        repo: this.repo,
        issue_number: parseInt(ticketId),
      });
      return this.normalizeTicket(issue);
    }
  }

  async getTickets(options?: {
    status?: string;
    assigneeId?: string;
  }): Promise<StandardTicket[]> {
    const { data: issues } = await this.client.issues.listForRepo({
      owner: this.owner,
      repo: this.repo,
      state: (options?.status as "open" | "closed" | "all") || "open",
      assignee: options?.assigneeId,
    });
    return issues.map((issue) => this.normalizeTicket(issue));
  }

  async createTicket(options: CreateTicketOptions): Promise<StandardTicket> {
    const { data } = await this.client.issues.create({
      owner: this.owner,
      repo: this.repo,
      title: options.title,
      body: options.description,
      assignees: options.assigneeId ? [options.assigneeId] : undefined,
      labels: options.labels,
    });
    return this.normalizeTicket(data);
  }

  async updateTicket(
    ticketId: string,
    updates: Partial<CreateTicketOptions>
  ): Promise<StandardTicket> {
    const { data } = await this.client.issues.update({
      owner: this.owner,
      repo: this.repo,
      issue_number: parseInt(ticketId),
      title: updates.title,
      body: updates.description,
      assignees: updates.assigneeId ? [updates.assigneeId] : undefined,
      labels: updates.labels,
    });
    return this.normalizeTicket(data);
  }

  async addComment(ticketId: string, comment: string): Promise<TicketComment> {
    const { data } = await this.client.issues.createComment({
      owner: this.owner,
      repo: this.repo,
      issue_number: parseInt(ticketId),
      body: comment,
    });
    return this.normalizeComment(data);
  }

  async createReviewRequest(
    options: CreateReviewRequest
  ): Promise<StandardPullRequest> {
    const { data } = await this.client.pulls.create({
      owner: this.owner,
      repo: this.repo,
      title: options.title,
      body: options.description,
      head: options.sourceBranch,
      base: options.targetBranch,
    });

    if (options.reviewers?.length) {
      await this.client.pulls.requestReviewers({
        owner: this.owner,
        repo: this.repo,
        pull_number: data.number,
        reviewers: options.reviewers,
      });
    }

    return this.normalizeTicket(data) as StandardPullRequest;
  }

  protected normalizeTicket(platformTicket: any): StandardTicket {
    const base = {
      id: platformTicket.number.toString(),
      title: platformTicket.title,
      description: platformTicket.body || "",
      createdAt: platformTicket.created_at,
      updatedAt: platformTicket.updated_at,
      status: platformTicket.state,
      author: {
        id: platformTicket.user.id.toString(),
        name: platformTicket.user.login,
      },
      assignee: platformTicket.assignee
        ? {
            id: platformTicket.assignee.id.toString(),
            name: platformTicket.assignee.login,
          }
        : undefined,
    };

    if ("pull_request" in platformTicket) {
      return {
        ...base,
        type: "pullRequest",
        sourceBranch: platformTicket.head.ref,
        targetBranch: platformTicket.base.ref,
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
        id: platformComment.user.id.toString(),
        name: platformComment.user.login,
      },
      createdAt: platformComment.created_at,
    };
  }
}

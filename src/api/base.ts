import {
  StandardPullRequest,
  StandardTicket,
  TicketingPlatform,
} from "../types/tickets";

export interface TicketComment {
  id: string;
  content: string;
  author: {
    id: string;
    name: string;
  };
  createdAt: string;
}

export interface CreateTicketOptions {
  title: string;
  description: string;
  assigneeId?: string;
  labels?: string[];
}

export interface CreateReviewRequest {
  title: string;
  description: string;
  sourceBranch: string;
  targetBranch: string;
  reviewers?: string[];
  labels?: string[];
}

export abstract class TicketPlatformClient {
  protected config: TicketingPlatform;

  constructor(config: TicketingPlatform) {
    this.config = config;
  }

  // Core methods that must be implemented by each platform
  abstract getTicket(ticketId: string): Promise<StandardTicket>;
  abstract getTickets(options?: {
    status?: string;
    assigneeId?: string;
  }): Promise<StandardTicket[]>;
  abstract createTicket(options: CreateTicketOptions): Promise<StandardTicket>;
  abstract updateTicket(
    ticketId: string,
    updates: Partial<CreateTicketOptions>
  ): Promise<StandardTicket>;
  abstract addComment(
    ticketId: string,
    comment: string
  ): Promise<TicketComment>;
  abstract createReviewRequest(
    options: CreateReviewRequest
  ): Promise<StandardPullRequest>;

  // Helper methods that can be overridden if needed
  protected abstract normalizeTicket(platformTicket: any): StandardTicket;
  protected abstract normalizeComment(platformComment: any): TicketComment;
}

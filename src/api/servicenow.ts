import axios, { AxiosInstance } from "axios";
import {
  PlatformAuth,
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

export interface ServiceNowConfig extends Omit<TicketingPlatform, "auth"> {
  type: "servicenow";
  instance: string; // e.g., "dev12345"
  auth: Extract<PlatformAuth, { type: "basic" | "oauth" }>;
}

export class ServiceNowClient extends TicketPlatformClient {
  private client: AxiosInstance;
  private readonly TABLE_INCIDENT = "incident";
  private readonly TABLE_CHANGE_REQUEST = "change_request";

  constructor(config: ServiceNowConfig) {
    super({
      type: config.type,
      baseUrl: `https://${config.instance}.service-now.com`,
      auth: config.auth,
    });

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };

    if (config.auth.type === "oauth") {
      headers["Authorization"] = `Bearer ${config.auth.accessToken}`;
    }

    this.client = axios.create({
      baseURL: `https://${config.instance}.service-now.com/api/now/v2`,
      ...(config.auth.type === "basic"
        ? {
            auth: {
              username: config.auth.username,
              password: config.auth.password,
            },
          }
        : {}),
      headers,
    });
  }

  async getTicket(ticketId: string): Promise<StandardTicket> {
    try {
      // Try as change request first
      const { data: changeResult } = await this.client.get(
        `/table/${this.TABLE_CHANGE_REQUEST}/${ticketId}`
      );
      return this.normalizeTicket(changeResult.result);
    } catch {
      // If not change request, try as incident
      const { data: incidentResult } = await this.client.get(
        `/table/${this.TABLE_INCIDENT}/${ticketId}`
      );
      return this.normalizeTicket(incidentResult.result);
    }
  }

  async getTickets(options?: {
    status?: string;
    assigneeId?: string;
  }): Promise<StandardTicket[]> {
    let query = "";
    if (options?.status) {
      query += `state=${this.mapStatusToServiceNow(options.status)}^`;
    }
    if (options?.assigneeId) {
      query += `assigned_to=${options.assigneeId}^`;
    }
    if (query) {
      query = `?sysparm_query=${query.slice(0, -1)}`; // Remove trailing ^
    }

    const [incidentResponse, changeResponse] = await Promise.all([
      this.client.get(`/table/${this.TABLE_INCIDENT}${query}`),
      this.client.get(`/table/${this.TABLE_CHANGE_REQUEST}${query}`),
    ]);

    return [
      ...incidentResponse.data.result.map((ticket: any) =>
        this.normalizeTicket(ticket)
      ),
      ...changeResponse.data.result.map((ticket: any) =>
        this.normalizeTicket(ticket)
      ),
    ];
  }

  async createTicket(options: CreateTicketOptions): Promise<StandardTicket> {
    const payload = {
      short_description: options.title,
      description: options.description,
      assigned_to: options.assigneeId,
      // Map labels to ServiceNow categories or tags if needed
      category: options.labels?.[0],
    };

    const { data } = await this.client.post(
      `/table/${this.TABLE_INCIDENT}`,
      payload
    );
    return this.normalizeTicket(data.result);
  }

  async updateTicket(
    ticketId: string,
    updates: Partial<CreateTicketOptions>
  ): Promise<StandardTicket> {
    const payload: any = {};

    if (updates.title) {
      payload.short_description = updates.title;
    }
    if (updates.description) {
      payload.description = updates.description;
    }
    if (updates.assigneeId) {
      payload.assigned_to = updates.assigneeId;
    }
    if (updates.labels?.length) {
      payload.category = updates.labels[0];
    }

    try {
      // Try updating as change request
      const { data } = await this.client.patch(
        `/table/${this.TABLE_CHANGE_REQUEST}/${ticketId}`,
        payload
      );
      return this.normalizeTicket(data.result);
    } catch {
      // If not change request, update as incident
      const { data } = await this.client.patch(
        `/table/${this.TABLE_INCIDENT}/${ticketId}`,
        payload
      );
      return this.normalizeTicket(data.result);
    }
  }

  async addComment(ticketId: string, comment: string): Promise<TicketComment> {
    // ServiceNow uses work notes for internal comments
    const payload = {
      work_notes: comment,
    };

    try {
      // Try adding to change request
      const { data } = await this.client.patch(
        `/table/${this.TABLE_CHANGE_REQUEST}/${ticketId}`,
        payload
      );
      return this.normalizeComment(data.result);
    } catch {
      // If not change request, add to incident
      const { data } = await this.client.patch(
        `/table/${this.TABLE_INCIDENT}/${ticketId}`,
        payload
      );
      return this.normalizeComment(data.result);
    }
  }

  async createReviewRequest(
    options: CreateReviewRequest
  ): Promise<StandardPullRequest> {
    // In ServiceNow, we'll create a change request for code reviews
    const description = `
${options.description}

Source Branch: ${options.sourceBranch}
Target Branch: ${options.targetBranch}
Reviewers: ${options.reviewers?.join(", ") || "None assigned"}
    `.trim();

    const payload = {
      short_description: options.title,
      description: description,
      type: "normal", // Standard change
      category: "Code Review",
      assigned_to: options.reviewers?.[0],
      // Add any additional reviewers to watch list if supported
      watch_list: options.reviewers?.slice(1).join(","),
    };

    const { data } = await this.client.post(
      `/table/${this.TABLE_CHANGE_REQUEST}`,
      payload
    );
    const createdChange = data.result;

    return {
      id: createdChange.sys_id,
      title: createdChange.short_description,
      description: createdChange.description,
      createdAt: createdChange.sys_created_on,
      updatedAt: createdChange.sys_updated_on,
      status: this.normalizeStatus(createdChange.state),
      type: "pullRequest",
      sourceBranch: options.sourceBranch,
      targetBranch: options.targetBranch,
      state: this.mapServiceNowStateToPRState(createdChange.state),
      author: {
        id: createdChange.sys_created_by,
        name: createdChange.sys_created_by,
      },
      assignee: createdChange.assigned_to
        ? {
            id: createdChange.assigned_to.value,
            name: createdChange.assigned_to.display_value,
          }
        : undefined,
    };
  }

  protected normalizeTicket(platformTicket: any): StandardTicket {
    const base = {
      id: platformTicket.sys_id,
      title: platformTicket.short_description,
      description: platformTicket.description || "",
      createdAt: platformTicket.sys_created_on,
      updatedAt: platformTicket.sys_updated_on,
      status: this.normalizeStatus(platformTicket.state),
      author: {
        id: platformTicket.sys_created_by,
        name: platformTicket.sys_created_by,
      },
      assignee: platformTicket.assigned_to
        ? {
            id: platformTicket.assigned_to.value,
            name: platformTicket.assigned_to.display_value,
          }
        : undefined,
    };

    // If it's a change request of category 'Code Review', treat it as a PR
    if (
      platformTicket.sys_class_name === this.TABLE_CHANGE_REQUEST &&
      platformTicket.category === "Code Review"
    ) {
      const description = platformTicket.description || "";
      const sourceBranchMatch = description.match(/Source Branch: (.+)$/m);
      const targetBranchMatch = description.match(/Target Branch: (.+)$/m);

      return {
        ...base,
        type: "pullRequest",
        sourceBranch: sourceBranchMatch?.[1] || "unknown",
        targetBranch: targetBranchMatch?.[1] || "unknown",
        state: this.mapServiceNowStateToPRState(platformTicket.state),
      } as StandardPullRequest;
    }

    return {
      ...base,
      type: "issue",
    };
  }

  protected normalizeComment(platformComment: any): TicketComment {
    return {
      id: platformComment.sys_id,
      content: platformComment.work_notes || "",
      author: {
        id: platformComment.sys_updated_by,
        name: platformComment.sys_updated_by,
      },
      createdAt: platformComment.sys_updated_on,
    };
  }

  private normalizeStatus(status: string): string {
    // ServiceNow numeric states to human readable
    const stateMap: { [key: string]: string } = {
      "1": "new",
      "2": "in_progress",
      "3": "on_hold",
      "6": "resolved",
      "7": "closed",
      "-5": "pending",
    };
    return stateMap[status] || status;
  }

  private mapStatusToServiceNow(status: string): string {
    // Reverse mapping of normalizeStatus
    const stateMap: { [key: string]: string } = {
      new: "1",
      in_progress: "2",
      on_hold: "3",
      resolved: "6",
      closed: "7",
      pending: "-5",
    };
    return stateMap[status.toLowerCase()] || "1";
  }

  private mapServiceNowStateToPRState(
    state: string
  ): "open" | "closed" | "merged" {
    switch (state) {
      case "3": // on hold
      case "1": // new
      case "2": // in progress
      case "-5": // pending
        return "open";
      case "6": // resolved
        return "merged";
      case "7": // closed
        return "closed";
      default:
        return "open";
    }
  }
}

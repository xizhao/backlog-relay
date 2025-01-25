import { TicketingPlatform } from "../types/tickets";
import { TicketPlatformClient } from "./base";
import { GitHubClient, GitHubConfig } from "./github";
import { GitLabClient, GitLabConfig } from "./gitlab";
import { JiraClient, JiraConfig } from "./jira";
import { ServiceNowClient, ServiceNowConfig } from "./servicenow";

export class TicketClientFactory {
  static createClient(config: TicketingPlatform): TicketPlatformClient {
    switch (config.type) {
      case "github":
        return new GitHubClient(config as GitHubConfig);
      case "gitlab":
        if (!("apiToken" in config && "projectId" in config)) {
          throw new Error("Invalid GitLab configuration");
        }
        return new GitLabClient(config as GitLabConfig);
      case "jira":
        if (
          !("apiToken" in config && "email" in config && "projectKey" in config)
        ) {
          throw new Error("Invalid Jira configuration");
        }
        return new JiraClient(config as JiraConfig);
      case "servicenow":
        return new ServiceNowClient(config as ServiceNowConfig);
      default:
        throw new Error(`Unknown platform type: ${config.type}`);
    }
  }
}

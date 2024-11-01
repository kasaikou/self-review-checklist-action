import { GitHub } from "@actions/github/lib/utils";
import {
    IssueComment,
    Repository,
    User,
} from "@octokit/graphql-schema";
import { hasGeneratedText } from "./markdown";

export async function getLabels(input: {
    octokit: InstanceType<typeof GitHub>,
    owner: string,
    repo: string,
    number: number,
}) {

    let after = null;
    let hasNextPage = true;
    let labels: string[] = [];

    while (hasNextPage) {

        const data = await input.octokit.graphql<{ repository: Repository; viewer: User }>(
            `
            query($repo: String! $owner: String! $number: Int! $after: String) {
                viewer { login }
                repository(name: $repo owner: $owner) {
                pullRequest(number: $number) {
                    labels(first: 100, after: $after) {
                        nodes {
                            name
                        }
                        pageInfo {
                            endCursor
                            hasNextPage
                        }
                    }
                }
                }
            }
        `,
            {
                owner: input.owner,
                repo: input.repo,
                number: input.number,
                after: after,
            }
        )

        const repository = data.repository as Repository;
        const labelsPart = repository.pullRequest?.labels?.nodes?.map(x => x!.name);
        if (labelsPart) {
            labels.push(...labelsPart)
        } else {
            break
        }

        after = repository.pullRequest?.labels?.pageInfo.endCursor;
        hasNextPage = repository.pullRequest?.labels?.pageInfo.hasNextPage ?? false;
    }

    return labels;
}

type findPrevCommentResult = {
    pullRequestId: string
    commentId?: string
    body: string
}

export async function findPrevComment(input: {
    octokit: InstanceType<typeof GitHub>,
    owner: string,
    repo: string,
    number: number,
}
): Promise<findPrevCommentResult | undefined> {

    let after = null;
    let hasNextPage = true;

    const data = await input.octokit.graphql<{ repository: Repository; viewer: User }>(
        `
            query($repo: String! $owner: String! $number: Int!) {
                repository(name: $repo owner: $owner) {
                pullRequest(number: $number) {                    
                    id
                    body
                }
                }
            }
            `,
        {
            owner: input.owner,
            repo: input.repo,
            number: input.number,
        }
    );

    const pullRequestId = data.repository.pullRequest!.id;

    if (hasGeneratedText(data.repository.pullRequest!.body)) {
        return {
            pullRequestId,
            body: data.repository.pullRequest!.body
        }
    }

    while (hasNextPage) {
        const data = await input.octokit.graphql<{ repository: Repository; viewer: User }>(
            `
            query($repo: String! $owner: String! $number: Int! $after: String) {
                repository(name: $repo owner: $owner) {
                pullRequest(number: $number) {                    
                    comments(first: 100 after: $after) {
                    nodes {
                        id
                        author {
                        login
                        }
                        isMinimized
                        body
                    }
                    pageInfo {
                        endCursor
                        hasNextPage
                    }
                    }
                }
                }
            }
            `,
            {
                owner: input.owner,
                repo: input.repo,
                number: input.number,
                after: after,
            }
        );

        const repository = data.repository as Repository;

        const target = repository.pullRequest?.comments?.nodes?.find(
            (node: IssueComment | null | undefined) => hasGeneratedText(node!.body)
        );

        if (target) {
            return {
                pullRequestId,
                body: target.body,
                commentId: target.id,
            };
        }

        after = repository.pullRequest?.comments?.pageInfo?.endCursor;
        hasNextPage = repository.pullRequest?.comments?.pageInfo?.hasNextPage ?? false
    }

    return undefined
}

export async function upsertComment(input: {
    octokit: InstanceType<typeof GitHub>,
    owner: string,
    repo: string,
    number: number,
    comment: string,
    found?: findPrevCommentResult,
}) {
    if (input.found) {
        if (input.found.commentId) {
            await input.octokit.graphql(
                `
                    mutation($input: UpdateIssueCommentInput!) {
                    updateIssueComment(input: $input) {
                            issueComment {
                                id
                                body
                            }
                        }
                    }
                `,
                {
                    input: {
                        id: input.found.commentId,
                        body: input.comment,
                    }
                }
            )
        } else {
            await input.octokit.graphql(
                `
                    mutation($input: UpdatePullRequestInput!) {
                        updatePullRequest(input: $input) {
                            pullRequest {
                                id
                                body
                            }
                        }
                    }
                `,
                {
                    input: {
                        pullRequestId: input.found.pullRequestId,
                        body: input.comment,
                    }
                }
            )
        }
    } else {
        await input.octokit.rest.issues.createComment({
            owner: input.owner,
            repo: input.repo,
            issue_number: input.number,
            body: input.comment,
        })
    }
}

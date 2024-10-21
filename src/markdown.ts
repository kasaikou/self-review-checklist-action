
const headingPrefix = "#### "
const checkedPrefix = "- [x] "
const uncheckedPrefix = "- [ ] "

export const prefixComment = "<!-- Generated by kasaikou/self-review-checklist-actions, DO NOT EDIT. -->"
export type markdownContents = {
    label: string,
    list: {
        name: string,
        checked: boolean,
    }[]
}[];

export function parseCheckList(markdown: string) {
    const lines = markdown.split('\n')
    let currentLabel = "";
    let resultMap = new Map<string, Map<string, boolean>>();

    for (const line of lines) {
        if (line.startsWith(headingPrefix)) {
            currentLabel = line.slice(headingPrefix.length);

        } else if (line.startsWith(checkedPrefix)) {
            let todoMap = resultMap.get(currentLabel)!;
            todoMap.set(line.slice(checkedPrefix.length), true);
            resultMap.set(currentLabel, todoMap);

        } else if (line.startsWith(uncheckedPrefix)) {
            let todoMap = resultMap.get(currentLabel)!;
            todoMap.set(line.slice(uncheckedPrefix.length), false);
            resultMap.set(currentLabel, todoMap);

        }
    }

    return resultMap
}

export function renderCheckList(input: {
    contents: markdownContents
}) {
    let markdown = "";
    markdown += prefixComment + "\n\n";
    for (const content of input.contents) {
        markdown += headingPrefix + content.label + "\n\n"
        for (const checkbox of content.list) {
            markdown += (checkbox.checked ? checkedPrefix : uncheckedPrefix) + checkbox.name + "\n"
        }
        markdown += "\n"
    }

    return markdown
}

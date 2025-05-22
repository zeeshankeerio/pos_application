import { relative } from "path";

const buildEslintCommand = (filenames) =>
    `next lint --fix --file ${filenames
        .map((f) => relative(process.cwd(), f))
        .join(" --file ")}`;

// eslint-disable-next-line import/no-anonymous-default-export
export default {
    "*.{js,jsx,ts,tsx}": [buildEslintCommand],
};

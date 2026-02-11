import globals from "globals";

export default [
    {
        files: ["src/**/*.js"],
        languageOptions: {
            globals: {
                ...globals.browser,
                ...globals.webextensions,
                chrome: "readonly"
            },
            ecmaVersion: 2022,
            sourceType: "module"
        },
        rules: {
            "no-unused-vars": ["warn", { "argsIgnorePattern": "^_" }],
            "no-undef": "error",
            "no-console": "off" 
        }
    },
    {
        files: ["scripts/**/*.js"],
        languageOptions: {
            globals: {
                ...globals.node
            }
        }
    }
];

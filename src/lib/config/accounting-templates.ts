export const JOURNAL_TEMPLATES = [
    {
        id: "salary-monthly",
        label: "Monthly Salary Payment",
        description: "Standard payroll entry: Salary Expense vs Cash/Bank",
        lines: [
            {
                accountMatch: ["5101", "salary", "gaji"], // keywords/codes to find account
                type: "expense",
                defaultDescription: "Salary Payment for [Month]",
                isDebit: true
            },
            {
                accountMatch: ["1101", "cash", "bank"],
                type: "asset",
                defaultDescription: "Salary Payment for [Month]",
                isDebit: false
            }
        ]
    },
    {
        id: "office-rent",
        label: "Office Rent",
        description: "Monthly office rent payment",
        lines: [
            {
                accountMatch: ["5201", "rent", "sewa"],
                type: "expense",
                defaultDescription: "Office Rent for [Month]",
                isDebit: true
            },
            {
                accountMatch: ["1101", "cash", "bank"],
                type: "asset",
                defaultDescription: "Office Rent for [Month]",
                isDebit: false
            }
        ]
    },
    {
        id: "depreciation",
        label: "Asset Depreciation",
        description: "Monthly asset value depreciation",
        lines: [
            {
                accountMatch: ["5901", "depreciation", "penyusutan"],
                type: "expense",
                defaultDescription: "Monthly Depreciation",
                isDebit: true
            },
            {
                accountMatch: ["1299", "accumulated", "akumulasi"],
                type: "asset",
                defaultDescription: "Monthly Depreciation",
                isDebit: false
            }
        ]
    }
];

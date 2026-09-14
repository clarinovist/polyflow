import type { Employee, EmployeePayType, EmployeeStatus } from '@prisma/client';
import type { Dispatch, SetStateAction } from 'react';

export type AllowanceRow = {
    id?: string;
    name: string;
    amount: string;
    isActive: boolean;
};

export type PersonalData = {
    employmentStatus:
        | 'PROBATION'
        | 'PERMANENT'
        | 'CONTRACT'
        | 'RESIGNED'
        | 'TERMINATED';
    joinDate: string;
    probationEndDate: string;
    contractEndDate: string;
    nik: string;
    npwp: string;
    birthDate: string;
    birthPlace: string;
    gender: 'MALE' | 'FEMALE' | '';
    maritalStatus: 'SINGLE' | 'MARRIED' | 'DIVORCED' | 'WIDOWED' | '';
    address: string;
    phone: string;
    bankName: string;
    bankAccountNo: string;
    bankAccountName: string;
    emergencyContactName: string;
    emergencyContactPhone: string;
    emergencyContactRelation: string;
};

export type EmployeeFormData = {
    name: string;
    code: string;
    role: string;
    status: EmployeeStatus;
    payType: EmployeePayType;
    dailyRate: number;
    overtimeHourlyRate: number;
    standardDayHours: number;
    monthlySalary: number;
    bpjsParticipant: boolean;
    bpjsEmployeeDeduction: number;
    bpjsEmployerCost: number;
    bpjsKesehatanNo: string;
    bpjsKetenagakerjaanNo: string;
};

export type FormStateProps = {
    formData: EmployeeFormData;
    setFormData: Dispatch<SetStateAction<EmployeeFormData>>;
};

export type AllowancePanelProps = {
    initialData?: Employee;
    allowances: AllowanceRow[];
    setAllowances: Dispatch<SetStateAction<AllowanceRow[]>>;
    allowancesLoading: boolean;
};

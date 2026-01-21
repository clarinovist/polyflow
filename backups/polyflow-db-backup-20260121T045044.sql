--
-- PostgreSQL database dump
--

\restrict omo99eXDdBHTjH1wryIVxdNO3ZAqITTCfEwHBg1BWadduPizXgjNBnswZxWJiCk

-- Dumped from database version 15.15
-- Dumped by pg_dump version 15.15

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


--
-- Name: BatchStatus; Type: TYPE; Schema: public; Owner: polyflow
--

CREATE TYPE public."BatchStatus" AS ENUM (
    'ACTIVE',
    'QUARANTINE',
    'EXPIRED',
    'CONSUMED'
);


ALTER TYPE public."BatchStatus" OWNER TO polyflow;

--
-- Name: CostingMethod; Type: TYPE; Schema: public; Owner: polyflow
--

CREATE TYPE public."CostingMethod" AS ENUM (
    'WEIGHTED_AVERAGE',
    'STANDARD_COST'
);


ALTER TYPE public."CostingMethod" OWNER TO polyflow;

--
-- Name: EmployeeStatus; Type: TYPE; Schema: public; Owner: polyflow
--

CREATE TYPE public."EmployeeStatus" AS ENUM (
    'ACTIVE',
    'INACTIVE'
);


ALTER TYPE public."EmployeeStatus" OWNER TO polyflow;

--
-- Name: InspectionResult; Type: TYPE; Schema: public; Owner: polyflow
--

CREATE TYPE public."InspectionResult" AS ENUM (
    'PASS',
    'FAIL',
    'QUARANTINE'
);


ALTER TYPE public."InspectionResult" OWNER TO polyflow;

--
-- Name: InvoiceStatus; Type: TYPE; Schema: public; Owner: polyflow
--

CREATE TYPE public."InvoiceStatus" AS ENUM (
    'UNPAID',
    'PARTIAL',
    'PAID',
    'CANCELLED'
);


ALTER TYPE public."InvoiceStatus" OWNER TO polyflow;

--
-- Name: MachineStatus; Type: TYPE; Schema: public; Owner: polyflow
--

CREATE TYPE public."MachineStatus" AS ENUM (
    'ACTIVE',
    'MAINTENANCE',
    'BROKEN'
);


ALTER TYPE public."MachineStatus" OWNER TO polyflow;

--
-- Name: MachineType; Type: TYPE; Schema: public; Owner: polyflow
--

CREATE TYPE public."MachineType" AS ENUM (
    'MIXER',
    'EXTRUDER',
    'REWINDER',
    'PACKER',
    'GRANULATOR'
);


ALTER TYPE public."MachineType" OWNER TO polyflow;

--
-- Name: MovementType; Type: TYPE; Schema: public; Owner: polyflow
--

CREATE TYPE public."MovementType" AS ENUM (
    'IN',
    'OUT',
    'TRANSFER',
    'ADJUSTMENT',
    'PURCHASE'
);


ALTER TYPE public."MovementType" OWNER TO polyflow;

--
-- Name: OpnameStatus; Type: TYPE; Schema: public; Owner: polyflow
--

CREATE TYPE public."OpnameStatus" AS ENUM (
    'OPEN',
    'COMPLETED',
    'CANCELLED'
);


ALTER TYPE public."OpnameStatus" OWNER TO polyflow;

--
-- Name: ProductType; Type: TYPE; Schema: public; Owner: polyflow
--

CREATE TYPE public."ProductType" AS ENUM (
    'RAW_MATERIAL',
    'INTERMEDIATE',
    'PACKAGING',
    'WIP',
    'FINISHED_GOOD',
    'SCRAP'
);


ALTER TYPE public."ProductType" OWNER TO polyflow;

--
-- Name: ProductionStatus; Type: TYPE; Schema: public; Owner: polyflow
--

CREATE TYPE public."ProductionStatus" AS ENUM (
    'DRAFT',
    'RELEASED',
    'IN_PROGRESS',
    'COMPLETED',
    'CANCELLED'
);


ALTER TYPE public."ProductionStatus" OWNER TO polyflow;

--
-- Name: PurchaseInvoiceStatus; Type: TYPE; Schema: public; Owner: polyflow
--

CREATE TYPE public."PurchaseInvoiceStatus" AS ENUM (
    'UNPAID',
    'PARTIAL',
    'PAID',
    'CANCELLED'
);


ALTER TYPE public."PurchaseInvoiceStatus" OWNER TO polyflow;

--
-- Name: PurchaseOrderStatus; Type: TYPE; Schema: public; Owner: polyflow
--

CREATE TYPE public."PurchaseOrderStatus" AS ENUM (
    'DRAFT',
    'SENT',
    'PARTIAL_RECEIVED',
    'RECEIVED',
    'CANCELLED'
);


ALTER TYPE public."PurchaseOrderStatus" OWNER TO polyflow;

--
-- Name: ReservationStatus; Type: TYPE; Schema: public; Owner: polyflow
--

CREATE TYPE public."ReservationStatus" AS ENUM (
    'ACTIVE',
    'FULFILLED',
    'CANCELLED',
    'EXPIRED'
);


ALTER TYPE public."ReservationStatus" OWNER TO polyflow;

--
-- Name: ReservationType; Type: TYPE; Schema: public; Owner: polyflow
--

CREATE TYPE public."ReservationType" AS ENUM (
    'SALES_ORDER',
    'PRODUCTION_ORDER',
    'TRANSFER_ORDER'
);


ALTER TYPE public."ReservationType" OWNER TO polyflow;

--
-- Name: Role; Type: TYPE; Schema: public; Owner: polyflow
--

CREATE TYPE public."Role" AS ENUM (
    'ADMIN',
    'WAREHOUSE',
    'PRODUCTION',
    'PPIC',
    'SALES'
);


ALTER TYPE public."Role" OWNER TO polyflow;

--
-- Name: SalesOrderStatus; Type: TYPE; Schema: public; Owner: polyflow
--

CREATE TYPE public."SalesOrderStatus" AS ENUM (
    'DRAFT',
    'CONFIRMED',
    'IN_PRODUCTION',
    'READY_TO_SHIP',
    'SHIPPED',
    'DELIVERED',
    'CANCELLED'
);


ALTER TYPE public."SalesOrderStatus" OWNER TO polyflow;

--
-- Name: SalesOrderType; Type: TYPE; Schema: public; Owner: polyflow
--

CREATE TYPE public."SalesOrderType" AS ENUM (
    'MAKE_TO_STOCK',
    'MAKE_TO_ORDER'
);


ALTER TYPE public."SalesOrderType" OWNER TO polyflow;

--
-- Name: SalesQuotationStatus; Type: TYPE; Schema: public; Owner: polyflow
--

CREATE TYPE public."SalesQuotationStatus" AS ENUM (
    'DRAFT',
    'SENT',
    'ACCEPTED',
    'REJECTED',
    'EXPIRED',
    'CONVERTED'
);


ALTER TYPE public."SalesQuotationStatus" OWNER TO polyflow;

--
-- Name: Unit; Type: TYPE; Schema: public; Owner: polyflow
--

CREATE TYPE public."Unit" AS ENUM (
    'KG',
    'ROLL',
    'BAL',
    'PCS',
    'ZAK'
);


ALTER TYPE public."Unit" OWNER TO polyflow;

--
-- Name: WorkShiftStatus; Type: TYPE; Schema: public; Owner: polyflow
--

CREATE TYPE public."WorkShiftStatus" AS ENUM (
    'ACTIVE',
    'INACTIVE'
);


ALTER TYPE public."WorkShiftStatus" OWNER TO polyflow;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: AuditLog; Type: TABLE; Schema: public; Owner: polyflow
--

CREATE TABLE public."AuditLog" (
    id text NOT NULL,
    "userId" text NOT NULL,
    action text NOT NULL,
    "entityType" text NOT NULL,
    "entityId" text NOT NULL,
    details text,
    changes jsonb,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."AuditLog" OWNER TO polyflow;

--
-- Name: Batch; Type: TABLE; Schema: public; Owner: polyflow
--

CREATE TABLE public."Batch" (
    id text NOT NULL,
    "batchNumber" text NOT NULL,
    "productVariantId" text NOT NULL,
    "locationId" text NOT NULL,
    quantity numeric(15,4) NOT NULL,
    "manufacturingDate" timestamp(3) without time zone NOT NULL,
    "expiryDate" timestamp(3) without time zone,
    status public."BatchStatus" DEFAULT 'ACTIVE'::public."BatchStatus" NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."Batch" OWNER TO polyflow;

--
-- Name: Bom; Type: TABLE; Schema: public; Owner: polyflow
--

CREATE TABLE public."Bom" (
    id text NOT NULL,
    name text NOT NULL,
    description text,
    "productVariantId" text NOT NULL,
    "outputQuantity" numeric(10,4) DEFAULT 1.0 NOT NULL,
    "isDefault" boolean DEFAULT false NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."Bom" OWNER TO polyflow;

--
-- Name: BomItem; Type: TABLE; Schema: public; Owner: polyflow
--

CREATE TABLE public."BomItem" (
    id text NOT NULL,
    "bomId" text NOT NULL,
    "productVariantId" text NOT NULL,
    quantity numeric(10,4) NOT NULL,
    "scrapPercentage" numeric(5,2),
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."BomItem" OWNER TO polyflow;

--
-- Name: Customer; Type: TABLE; Schema: public; Owner: polyflow
--

CREATE TABLE public."Customer" (
    id text NOT NULL,
    name text NOT NULL,
    code text,
    phone text,
    email text,
    "billingAddress" text,
    "shippingAddress" text,
    "taxId" text,
    "creditLimit" numeric(15,2),
    "paymentTermDays" integer,
    "discountPercent" numeric(5,2),
    notes text,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."Customer" OWNER TO polyflow;

--
-- Name: Employee; Type: TABLE; Schema: public; Owner: polyflow
--

CREATE TABLE public."Employee" (
    id text NOT NULL,
    name text NOT NULL,
    code text NOT NULL,
    role text NOT NULL,
    status public."EmployeeStatus" DEFAULT 'ACTIVE'::public."EmployeeStatus" NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."Employee" OWNER TO polyflow;

--
-- Name: GoodsReceipt; Type: TABLE; Schema: public; Owner: polyflow
--

CREATE TABLE public."GoodsReceipt" (
    id text NOT NULL,
    "receiptNumber" text NOT NULL,
    "purchaseOrderId" text NOT NULL,
    "receivedDate" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "locationId" text NOT NULL,
    notes text,
    "createdById" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."GoodsReceipt" OWNER TO polyflow;

--
-- Name: GoodsReceiptItem; Type: TABLE; Schema: public; Owner: polyflow
--

CREATE TABLE public."GoodsReceiptItem" (
    id text NOT NULL,
    "goodsReceiptId" text NOT NULL,
    "productVariantId" text NOT NULL,
    "receivedQty" numeric(15,4) NOT NULL,
    "unitCost" numeric(15,4) NOT NULL
);


ALTER TABLE public."GoodsReceiptItem" OWNER TO polyflow;

--
-- Name: Inventory; Type: TABLE; Schema: public; Owner: polyflow
--

CREATE TABLE public."Inventory" (
    id text NOT NULL,
    "locationId" text NOT NULL,
    "productVariantId" text NOT NULL,
    quantity numeric(15,4) DEFAULT 0 NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "averageCost" numeric(15,4)
);


ALTER TABLE public."Inventory" OWNER TO polyflow;

--
-- Name: Invoice; Type: TABLE; Schema: public; Owner: polyflow
--

CREATE TABLE public."Invoice" (
    id text NOT NULL,
    "invoiceNumber" text NOT NULL,
    "salesOrderId" text NOT NULL,
    "invoiceDate" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "dueDate" timestamp(3) without time zone,
    status public."InvoiceStatus" DEFAULT 'UNPAID'::public."InvoiceStatus" NOT NULL,
    "totalAmount" numeric(15,2) NOT NULL,
    "paidAmount" numeric(15,2) DEFAULT 0 NOT NULL,
    notes text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."Invoice" OWNER TO polyflow;

--
-- Name: JobRole; Type: TABLE; Schema: public; Owner: polyflow
--

CREATE TABLE public."JobRole" (
    id text NOT NULL,
    name text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."JobRole" OWNER TO polyflow;

--
-- Name: Location; Type: TABLE; Schema: public; Owner: polyflow
--

CREATE TABLE public."Location" (
    id text NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    description text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."Location" OWNER TO polyflow;

--
-- Name: Machine; Type: TABLE; Schema: public; Owner: polyflow
--

CREATE TABLE public."Machine" (
    id text NOT NULL,
    name text NOT NULL,
    code text NOT NULL,
    type public."MachineType" NOT NULL,
    "locationId" text NOT NULL,
    status public."MachineStatus" DEFAULT 'ACTIVE'::public."MachineStatus" NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."Machine" OWNER TO polyflow;

--
-- Name: MachineDowntime; Type: TABLE; Schema: public; Owner: polyflow
--

CREATE TABLE public."MachineDowntime" (
    id text NOT NULL,
    "machineId" text NOT NULL,
    reason text NOT NULL,
    "startTime" timestamp(3) without time zone NOT NULL,
    "endTime" timestamp(3) without time zone,
    "createdById" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."MachineDowntime" OWNER TO polyflow;

--
-- Name: MaterialIssue; Type: TABLE; Schema: public; Owner: polyflow
--

CREATE TABLE public."MaterialIssue" (
    id text NOT NULL,
    "productionOrderId" text NOT NULL,
    "productVariantId" text NOT NULL,
    quantity numeric(15,4) NOT NULL,
    "issuedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "createdById" text,
    "batchId" text
);


ALTER TABLE public."MaterialIssue" OWNER TO polyflow;

--
-- Name: Product; Type: TABLE; Schema: public; Owner: polyflow
--

CREATE TABLE public."Product" (
    id text NOT NULL,
    name text NOT NULL,
    "productType" public."ProductType" NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."Product" OWNER TO polyflow;

--
-- Name: ProductVariant; Type: TABLE; Schema: public; Owner: polyflow
--

CREATE TABLE public."ProductVariant" (
    id text NOT NULL,
    "productId" text NOT NULL,
    name text NOT NULL,
    "skuCode" text NOT NULL,
    price numeric(10,2),
    "buyPrice" numeric(10,2),
    "sellPrice" numeric(10,2),
    "primaryUnit" public."Unit" NOT NULL,
    "salesUnit" public."Unit",
    "conversionFactor" numeric(10,4) DEFAULT 1.0 NOT NULL,
    attributes jsonb,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "minStockAlert" numeric(15,4),
    "leadTimeDays" integer,
    "preferredSupplierId" text,
    "reorderPoint" numeric(15,4),
    "reorderQuantity" numeric(15,4),
    "costingMethod" public."CostingMethod" DEFAULT 'WEIGHTED_AVERAGE'::public."CostingMethod" NOT NULL,
    "standardCost" numeric(15,4)
);


ALTER TABLE public."ProductVariant" OWNER TO polyflow;

--
-- Name: ProductionExecution; Type: TABLE; Schema: public; Owner: polyflow
--

CREATE TABLE public."ProductionExecution" (
    id text NOT NULL,
    "productionOrderId" text NOT NULL,
    "machineId" text,
    "operatorId" text,
    "shiftId" text,
    "quantityProduced" numeric(15,4) NOT NULL,
    "scrapQuantity" numeric(15,4) DEFAULT 0 NOT NULL,
    "startTime" timestamp(3) without time zone NOT NULL,
    "endTime" timestamp(3) without time zone,
    notes text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."ProductionExecution" OWNER TO polyflow;

--
-- Name: ProductionMaterial; Type: TABLE; Schema: public; Owner: polyflow
--

CREATE TABLE public."ProductionMaterial" (
    id text NOT NULL,
    "productionOrderId" text NOT NULL,
    "productVariantId" text NOT NULL,
    quantity numeric(15,4) NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."ProductionMaterial" OWNER TO polyflow;

--
-- Name: ProductionOrder; Type: TABLE; Schema: public; Owner: polyflow
--

CREATE TABLE public."ProductionOrder" (
    id text NOT NULL,
    "orderNumber" text NOT NULL,
    "bomId" text NOT NULL,
    "plannedQuantity" numeric(15,4) NOT NULL,
    "plannedStartDate" timestamp(3) without time zone NOT NULL,
    "plannedEndDate" timestamp(3) without time zone,
    "actualQuantity" numeric(15,4),
    "actualStartDate" timestamp(3) without time zone,
    "actualEndDate" timestamp(3) without time zone,
    status public."ProductionStatus" DEFAULT 'DRAFT'::public."ProductionStatus" NOT NULL,
    "machineId" text,
    "locationId" text NOT NULL,
    "createdById" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    notes text,
    "salesOrderId" text
);


ALTER TABLE public."ProductionOrder" OWNER TO polyflow;

--
-- Name: ProductionShift; Type: TABLE; Schema: public; Owner: polyflow
--

CREATE TABLE public."ProductionShift" (
    id text NOT NULL,
    "productionOrderId" text NOT NULL,
    "shiftName" text NOT NULL,
    "startTime" timestamp(3) without time zone NOT NULL,
    "endTime" timestamp(3) without time zone NOT NULL,
    "operatorId" text,
    "outputQuantity" numeric(15,4),
    notes text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."ProductionShift" OWNER TO polyflow;

--
-- Name: PurchaseInvoice; Type: TABLE; Schema: public; Owner: polyflow
--

CREATE TABLE public."PurchaseInvoice" (
    id text NOT NULL,
    "invoiceNumber" text NOT NULL,
    "purchaseOrderId" text NOT NULL,
    "invoiceDate" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "dueDate" timestamp(3) without time zone,
    status public."PurchaseInvoiceStatus" DEFAULT 'UNPAID'::public."PurchaseInvoiceStatus" NOT NULL,
    "totalAmount" numeric(15,2) NOT NULL,
    "paidAmount" numeric(15,2) DEFAULT 0 NOT NULL,
    notes text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."PurchaseInvoice" OWNER TO polyflow;

--
-- Name: PurchaseOrder; Type: TABLE; Schema: public; Owner: polyflow
--

CREATE TABLE public."PurchaseOrder" (
    id text NOT NULL,
    "orderNumber" text NOT NULL,
    "supplierId" text NOT NULL,
    "orderDate" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "expectedDate" timestamp(3) without time zone,
    status public."PurchaseOrderStatus" DEFAULT 'DRAFT'::public."PurchaseOrderStatus" NOT NULL,
    "totalAmount" numeric(15,2),
    notes text,
    "createdById" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."PurchaseOrder" OWNER TO polyflow;

--
-- Name: PurchaseOrderItem; Type: TABLE; Schema: public; Owner: polyflow
--

CREATE TABLE public."PurchaseOrderItem" (
    id text NOT NULL,
    "purchaseOrderId" text NOT NULL,
    "productVariantId" text NOT NULL,
    quantity numeric(15,4) NOT NULL,
    "unitPrice" numeric(15,4) NOT NULL,
    subtotal numeric(15,2) NOT NULL,
    "receivedQty" numeric(15,4) DEFAULT 0 NOT NULL
);


ALTER TABLE public."PurchaseOrderItem" OWNER TO polyflow;

--
-- Name: PurchasePayment; Type: TABLE; Schema: public; Owner: polyflow
--

CREATE TABLE public."PurchasePayment" (
    id text NOT NULL,
    "purchaseInvoiceId" text NOT NULL,
    amount numeric(15,2) NOT NULL,
    "paymentDate" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "paymentMethod" text,
    reference text,
    notes text,
    "createdById" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."PurchasePayment" OWNER TO polyflow;

--
-- Name: QualityInspection; Type: TABLE; Schema: public; Owner: polyflow
--

CREATE TABLE public."QualityInspection" (
    id text NOT NULL,
    "productionOrderId" text NOT NULL,
    "inspectorId" text,
    result public."InspectionResult" NOT NULL,
    notes text,
    "inspectedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."QualityInspection" OWNER TO polyflow;

--
-- Name: RolePermission; Type: TABLE; Schema: public; Owner: polyflow
--

CREATE TABLE public."RolePermission" (
    id text NOT NULL,
    role public."Role" NOT NULL,
    resource text NOT NULL,
    "canAccess" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."RolePermission" OWNER TO polyflow;

--
-- Name: SalesOrder; Type: TABLE; Schema: public; Owner: polyflow
--

CREATE TABLE public."SalesOrder" (
    id text NOT NULL,
    "orderNumber" text NOT NULL,
    "customerId" text,
    "orderDate" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "expectedDate" timestamp(3) without time zone,
    "orderType" public."SalesOrderType" DEFAULT 'MAKE_TO_STOCK'::public."SalesOrderType" NOT NULL,
    status public."SalesOrderStatus" DEFAULT 'DRAFT'::public."SalesOrderStatus" NOT NULL,
    "sourceLocationId" text,
    "totalAmount" numeric(15,2),
    notes text,
    "createdById" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "discountAmount" numeric(15,2),
    "taxAmount" numeric(15,2),
    "quotationId" text
);


ALTER TABLE public."SalesOrder" OWNER TO polyflow;

--
-- Name: SalesOrderItem; Type: TABLE; Schema: public; Owner: polyflow
--

CREATE TABLE public."SalesOrderItem" (
    id text NOT NULL,
    "salesOrderId" text NOT NULL,
    "productVariantId" text NOT NULL,
    quantity numeric(15,4) NOT NULL,
    "unitPrice" numeric(15,2) NOT NULL,
    subtotal numeric(15,2) NOT NULL,
    "deliveredQty" numeric(15,4) DEFAULT 0 NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "discountPercent" numeric(5,2),
    "taxAmount" numeric(15,2),
    "taxPercent" numeric(5,2)
);


ALTER TABLE public."SalesOrderItem" OWNER TO polyflow;

--
-- Name: SalesQuotation; Type: TABLE; Schema: public; Owner: polyflow
--

CREATE TABLE public."SalesQuotation" (
    id text NOT NULL,
    "quotationNumber" text NOT NULL,
    "customerId" text,
    "quotationDate" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "validUntil" timestamp(3) without time zone,
    status public."SalesQuotationStatus" DEFAULT 'DRAFT'::public."SalesQuotationStatus" NOT NULL,
    "totalAmount" numeric(15,2),
    "discountAmount" numeric(15,2),
    "taxAmount" numeric(15,2),
    notes text,
    "createdById" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."SalesQuotation" OWNER TO polyflow;

--
-- Name: SalesQuotationItem; Type: TABLE; Schema: public; Owner: polyflow
--

CREATE TABLE public."SalesQuotationItem" (
    id text NOT NULL,
    "salesQuotationId" text NOT NULL,
    "productVariantId" text NOT NULL,
    quantity numeric(15,4) NOT NULL,
    "unitPrice" numeric(15,2) NOT NULL,
    "discountPercent" numeric(5,2),
    "taxPercent" numeric(5,2),
    "taxAmount" numeric(15,2),
    subtotal numeric(15,2) NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."SalesQuotationItem" OWNER TO polyflow;

--
-- Name: ScrapRecord; Type: TABLE; Schema: public; Owner: polyflow
--

CREATE TABLE public."ScrapRecord" (
    id text NOT NULL,
    "productionOrderId" text NOT NULL,
    "productVariantId" text NOT NULL,
    quantity numeric(15,4) NOT NULL,
    reason text,
    "recordedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "createdById" text
);


ALTER TABLE public."ScrapRecord" OWNER TO polyflow;

--
-- Name: StockMovement; Type: TABLE; Schema: public; Owner: polyflow
--

CREATE TABLE public."StockMovement" (
    id text NOT NULL,
    type public."MovementType" NOT NULL,
    "productVariantId" text NOT NULL,
    "fromLocationId" text,
    "toLocationId" text,
    quantity numeric(15,4) NOT NULL,
    cost numeric(15,4),
    reference text,
    "createdById" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "batchId" text,
    "salesOrderId" text,
    "goodsReceiptId" text
);


ALTER TABLE public."StockMovement" OWNER TO polyflow;

--
-- Name: StockOpname; Type: TABLE; Schema: public; Owner: polyflow
--

CREATE TABLE public."StockOpname" (
    id text NOT NULL,
    "locationId" text NOT NULL,
    status public."OpnameStatus" DEFAULT 'OPEN'::public."OpnameStatus" NOT NULL,
    remarks text,
    "createdById" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "completedAt" timestamp(3) without time zone,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."StockOpname" OWNER TO polyflow;

--
-- Name: StockOpnameItem; Type: TABLE; Schema: public; Owner: polyflow
--

CREATE TABLE public."StockOpnameItem" (
    id text NOT NULL,
    "opnameId" text NOT NULL,
    "productVariantId" text NOT NULL,
    "systemQuantity" numeric(15,4) NOT NULL,
    "countedQuantity" numeric(15,4),
    notes text
);


ALTER TABLE public."StockOpnameItem" OWNER TO polyflow;

--
-- Name: StockReservation; Type: TABLE; Schema: public; Owner: polyflow
--

CREATE TABLE public."StockReservation" (
    id text NOT NULL,
    "productVariantId" text NOT NULL,
    "locationId" text NOT NULL,
    quantity numeric(15,4) NOT NULL,
    "reservedFor" public."ReservationType" NOT NULL,
    "referenceId" text NOT NULL,
    "reservedUntil" timestamp(3) without time zone,
    status public."ReservationStatus" DEFAULT 'ACTIVE'::public."ReservationStatus" NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."StockReservation" OWNER TO polyflow;

--
-- Name: Supplier; Type: TABLE; Schema: public; Owner: polyflow
--

CREATE TABLE public."Supplier" (
    id text NOT NULL,
    name text NOT NULL,
    code text,
    phone text,
    email text,
    address text,
    "taxId" text,
    "paymentTermDays" integer,
    "bankName" text,
    "bankAccount" text,
    notes text,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."Supplier" OWNER TO polyflow;

--
-- Name: SupplierProduct; Type: TABLE; Schema: public; Owner: polyflow
--

CREATE TABLE public."SupplierProduct" (
    id text NOT NULL,
    "supplierId" text NOT NULL,
    "productVariantId" text NOT NULL,
    "unitPrice" numeric(15,4),
    "leadTimeDays" integer,
    "minOrderQty" numeric(15,4),
    "isPreferred" boolean DEFAULT false NOT NULL,
    notes text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."SupplierProduct" OWNER TO polyflow;

--
-- Name: User; Type: TABLE; Schema: public; Owner: polyflow
--

CREATE TABLE public."User" (
    id text NOT NULL,
    email text NOT NULL,
    name text,
    password text NOT NULL,
    role public."Role" DEFAULT 'WAREHOUSE'::public."Role" NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."User" OWNER TO polyflow;

--
-- Name: WorkShift; Type: TABLE; Schema: public; Owner: polyflow
--

CREATE TABLE public."WorkShift" (
    id text NOT NULL,
    name text NOT NULL,
    "startTime" text NOT NULL,
    "endTime" text NOT NULL,
    status public."WorkShiftStatus" DEFAULT 'ACTIVE'::public."WorkShiftStatus" NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."WorkShift" OWNER TO polyflow;

--
-- Name: _ShiftHelpers; Type: TABLE; Schema: public; Owner: polyflow
--

CREATE TABLE public."_ShiftHelpers" (
    "A" text NOT NULL,
    "B" text NOT NULL
);


ALTER TABLE public."_ShiftHelpers" OWNER TO polyflow;

--
-- Name: _prisma_migrations; Type: TABLE; Schema: public; Owner: polyflow
--

CREATE TABLE public._prisma_migrations (
    id character varying(36) NOT NULL,
    checksum character varying(64) NOT NULL,
    finished_at timestamp with time zone,
    migration_name character varying(255) NOT NULL,
    logs text,
    rolled_back_at timestamp with time zone,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    applied_steps_count integer DEFAULT 0 NOT NULL
);


ALTER TABLE public._prisma_migrations OWNER TO polyflow;

--
-- Data for Name: AuditLog; Type: TABLE DATA; Schema: public; Owner: polyflow
--

COPY public."AuditLog" (id, "userId", action, "entityType", "entityId", details, changes, "createdAt") FROM stdin;
2a374205-0fc7-4b9a-bfa5-d1fc0ed49965	f0000eff-2dfa-4cad-8669-0243b1f9f51e	ADJUST_STOCK_BULK	ProductVariant	68e92ebb-6fce-4483-bc9d-cc0ab1d001cb	Bulk Adjusted ADJUSTMENT_IN 500 at 75ad437b-9b34-41e1-b427-7cb63e236247. Reason: Inital Stock	\N	2026-01-19 02:49:19.778
720f3ab6-c0ec-4750-9405-bee0796d14ec	f0000eff-2dfa-4cad-8669-0243b1f9f51e	ADJUST_STOCK_BULK	ProductVariant	68e92ebb-6fce-4483-bc9d-cc0ab1d001cb	Bulk Adjusted ADJUSTMENT_OUT 500 at 75ad437b-9b34-41e1-b427-7cb63e236247. Reason: Stock Out\n	\N	2026-01-19 02:51:27.612
74ea7dbf-770c-4f65-9327-fc7fc1ebb0f1	f0000eff-2dfa-4cad-8669-0243b1f9f51e	ADJUST_STOCK_BULK	ProductVariant	b5b45f5d-55b7-4d8c-a7f7-9794bda116f9	Bulk Adjusted ADJUSTMENT_IN 100 at 75ad437b-9b34-41e1-b427-7cb63e236247. Reason: Initial Stock Import	\N	2026-01-19 06:29:13.16
5ed21312-966a-42d4-972e-eacbd51ca3fd	f0000eff-2dfa-4cad-8669-0243b1f9f51e	ADJUST_STOCK_BULK	ProductVariant	68e92ebb-6fce-4483-bc9d-cc0ab1d001cb	Bulk Adjusted ADJUSTMENT_IN 100 at 75ad437b-9b34-41e1-b427-7cb63e236247. Reason: Initial Stock Import	\N	2026-01-19 06:29:13.174
552a5693-c20e-4dd5-96e1-a6fadb158131	f0000eff-2dfa-4cad-8669-0243b1f9f51e	ADJUST_STOCK_BULK	ProductVariant	56c57505-4059-46cf-9eea-c16dfa8e970c	Bulk Adjusted ADJUSTMENT_IN 100 at 75ad437b-9b34-41e1-b427-7cb63e236247. Reason: Initial Stock Import	\N	2026-01-19 06:29:13.19
e9a4b5cd-ae0e-4220-bc87-bf30efe1dc37	f0000eff-2dfa-4cad-8669-0243b1f9f51e	ADJUST_STOCK_BULK	ProductVariant	5fc56a9d-a649-4654-be01-40545adb299b	Bulk Adjusted ADJUSTMENT_IN 100 at 75ad437b-9b34-41e1-b427-7cb63e236247. Reason: Initial Stock Import	\N	2026-01-19 06:29:13.2
882c3f81-ba8e-47c6-878e-ab5ca4f9b675	f0000eff-2dfa-4cad-8669-0243b1f9f51e	ADJUST_STOCK_BULK	ProductVariant	5e18ea2a-2800-489c-a423-249d8074f019	Bulk Adjusted ADJUSTMENT_IN 100 at 75ad437b-9b34-41e1-b427-7cb63e236247. Reason: Initial Stock Import	\N	2026-01-19 06:29:13.211
060e968f-527d-478a-91af-2815f039ad5c	f0000eff-2dfa-4cad-8669-0243b1f9f51e	ADJUST_STOCK_BULK	ProductVariant	efb73e36-20cd-456b-8a11-64069c9a6dde	Bulk Adjusted ADJUSTMENT_IN 100 at 75ad437b-9b34-41e1-b427-7cb63e236247. Reason: Initial Stock Import	\N	2026-01-19 06:29:13.231
0ac0769a-8511-45da-8ad1-42f1946e193e	f0000eff-2dfa-4cad-8669-0243b1f9f51e	ADJUST_STOCK_BULK	ProductVariant	c94295dc-bf84-4f89-9a76-c352b90986ce	Bulk Adjusted ADJUSTMENT_IN 100 at 75ad437b-9b34-41e1-b427-7cb63e236247. Reason: Initial Stock Import	\N	2026-01-19 06:29:13.252
ceb26612-e916-4405-b58f-ff1c13e4b44c	f0000eff-2dfa-4cad-8669-0243b1f9f51e	ADJUST_STOCK_BULK	ProductVariant	ba05f26d-9c26-45bf-b6e7-27f2c65a447a	Bulk Adjusted ADJUSTMENT_IN 100 at 75ad437b-9b34-41e1-b427-7cb63e236247. Reason: Initial Stock Import	\N	2026-01-19 06:29:13.265
c94c1558-bc1e-4a4a-a727-968461e477fa	f0000eff-2dfa-4cad-8669-0243b1f9f51e	ADJUST_STOCK_BULK	ProductVariant	1700703a-b14f-4677-b909-e29a1c03ec36	Bulk Adjusted ADJUSTMENT_IN 100 at 75ad437b-9b34-41e1-b427-7cb63e236247. Reason: Initial Stock Import	\N	2026-01-19 06:29:13.28
213e5d54-6295-4e04-9192-89b5b043b4fe	f0000eff-2dfa-4cad-8669-0243b1f9f51e	ADJUST_STOCK_BULK	ProductVariant	30ecde3c-b399-4359-af4f-c98bd11c5db6	Bulk Adjusted ADJUSTMENT_IN 100 at 75ad437b-9b34-41e1-b427-7cb63e236247. Reason: Initial Stock Import	\N	2026-01-19 06:29:13.292
950a9061-6a59-4678-afcf-116dfb3686b0	f0000eff-2dfa-4cad-8669-0243b1f9f51e	ADJUST_STOCK_BULK	ProductVariant	db9bac3b-0832-43c3-bfef-123ffe9db980	Bulk Adjusted ADJUSTMENT_IN 100 at 75ad437b-9b34-41e1-b427-7cb63e236247. Reason: Initial Stock Import	\N	2026-01-19 06:29:13.304
2c808856-19e8-4d62-83c3-a7fa90e08dc0	f0000eff-2dfa-4cad-8669-0243b1f9f51e	ADJUST_STOCK_BULK	ProductVariant	15298147-4624-4921-a762-da82ec5e19f1	Bulk Adjusted ADJUSTMENT_IN 100 at 75ad437b-9b34-41e1-b427-7cb63e236247. Reason: Initial Stock Import	\N	2026-01-19 06:29:13.321
b142d172-f55c-401d-890a-ed8482747311	f0000eff-2dfa-4cad-8669-0243b1f9f51e	ADJUST_STOCK_BULK	ProductVariant	c25c2770-ec37-4d87-a1d3-bf38e0117992	Bulk Adjusted ADJUSTMENT_IN 100 at 75ad437b-9b34-41e1-b427-7cb63e236247. Reason: Initial Stock Import	\N	2026-01-19 06:29:13.331
3461784e-d1d0-4030-8172-e59a721c9345	f0000eff-2dfa-4cad-8669-0243b1f9f51e	ADJUST_STOCK_BULK	ProductVariant	dca00a7c-3d85-47ed-8559-da9659a102c1	Bulk Adjusted ADJUSTMENT_IN 100 at 75ad437b-9b34-41e1-b427-7cb63e236247. Reason: Initial Stock Import	\N	2026-01-19 06:29:13.343
651b4b71-9270-4ee5-bb20-a0071b80279c	f0000eff-2dfa-4cad-8669-0243b1f9f51e	ADJUST_STOCK_BULK	ProductVariant	03178aa0-cda1-484c-b85c-60eb6386c606	Bulk Adjusted ADJUSTMENT_IN 100 at 75ad437b-9b34-41e1-b427-7cb63e236247. Reason: Initial Stock Import	\N	2026-01-19 06:29:13.357
5a8f2c90-1ad9-432a-ad52-eca9df064e2b	f0000eff-2dfa-4cad-8669-0243b1f9f51e	ADJUST_STOCK_BULK	ProductVariant	e9c1e73b-4fe5-4037-9385-20bab938b240	Bulk Adjusted ADJUSTMENT_IN 100 at 75ad437b-9b34-41e1-b427-7cb63e236247. Reason: Initial Stock Import	\N	2026-01-19 06:29:13.37
0b882a05-0a7c-4347-a5bc-fc97a648410b	f0000eff-2dfa-4cad-8669-0243b1f9f51e	ADJUST_STOCK_BULK	ProductVariant	05f32ad0-c46a-4f7e-9e1e-ad3a0967b878	Bulk Adjusted ADJUSTMENT_IN 100 at 75ad437b-9b34-41e1-b427-7cb63e236247. Reason: Initial Stock Import	\N	2026-01-19 06:29:13.384
73a6b17d-be68-4814-a8a4-529ba359c49e	f0000eff-2dfa-4cad-8669-0243b1f9f51e	ADJUST_STOCK_BULK	ProductVariant	e4d7b713-2714-4555-8378-47741a4951af	Bulk Adjusted ADJUSTMENT_IN 100 at 75ad437b-9b34-41e1-b427-7cb63e236247. Reason: Initial Stock Import	\N	2026-01-19 06:29:13.397
25b50371-b77d-4660-96cc-8feb742b7bde	f0000eff-2dfa-4cad-8669-0243b1f9f51e	ADJUST_STOCK_BULK	ProductVariant	0e5d730f-9d6c-4445-b20d-b3901f8c9205	Bulk Adjusted ADJUSTMENT_IN 100 at 75ad437b-9b34-41e1-b427-7cb63e236247. Reason: Initial Stock Import	\N	2026-01-19 06:29:13.409
822ebc47-8043-4b12-8048-04834da9417e	f0000eff-2dfa-4cad-8669-0243b1f9f51e	ADJUST_STOCK_BULK	ProductVariant	7a5251cc-18d8-4f78-833c-afd4fdc8c9b5	Bulk Adjusted ADJUSTMENT_IN 100 at 75ad437b-9b34-41e1-b427-7cb63e236247. Reason: Initial Stock Import	\N	2026-01-19 06:29:13.422
9475802a-71ae-4d6f-a90d-c757b579442f	f0000eff-2dfa-4cad-8669-0243b1f9f51e	ADJUST_STOCK_BULK	ProductVariant	534c06cf-cf1f-4014-bdfc-e99820d04469	Bulk Adjusted ADJUSTMENT_IN 100 at 75ad437b-9b34-41e1-b427-7cb63e236247. Reason: Initial Stock Import	\N	2026-01-19 06:29:13.432
56df4ba4-228b-4698-93da-4d89592b4454	f0000eff-2dfa-4cad-8669-0243b1f9f51e	ADJUST_STOCK_BULK	ProductVariant	5f44845e-fbae-4fd8-8338-5b6cad10fbd1	Bulk Adjusted ADJUSTMENT_IN 100 at 75ad437b-9b34-41e1-b427-7cb63e236247. Reason: Initial Stock Import	\N	2026-01-19 06:29:13.441
d6234b31-c1d9-4dc6-8dfb-ba528a5bcbac	f0000eff-2dfa-4cad-8669-0243b1f9f51e	ADJUST_STOCK_BULK	ProductVariant	94fff4c0-f8c1-4451-933c-8e6a19efc41d	Bulk Adjusted ADJUSTMENT_IN 100 at 75ad437b-9b34-41e1-b427-7cb63e236247. Reason: Initial Stock Import	\N	2026-01-19 06:29:13.453
2d02b8e0-a86a-4c01-a659-bc176a767e4e	f0000eff-2dfa-4cad-8669-0243b1f9f51e	ADJUST_STOCK_BULK	ProductVariant	f7eb4c8c-6e14-4709-9590-1bebf0633feb	Bulk Adjusted ADJUSTMENT_IN 100 at 75ad437b-9b34-41e1-b427-7cb63e236247. Reason: Initial Stock Import	\N	2026-01-19 06:29:13.465
69e6a912-6338-428a-81d8-0086b23516ed	f0000eff-2dfa-4cad-8669-0243b1f9f51e	ADJUST_STOCK_BULK	ProductVariant	16ff1042-ff62-463e-a352-c0dd5cfcdc7c	Bulk Adjusted ADJUSTMENT_IN 100 at 75ad437b-9b34-41e1-b427-7cb63e236247. Reason: Initial Stock Import	\N	2026-01-19 06:29:13.477
d0845416-db73-402c-9baf-e82e91bca195	f0000eff-2dfa-4cad-8669-0243b1f9f51e	ADJUST_STOCK_BULK	ProductVariant	4b88c5d3-24ea-45c3-90db-c19715eb600e	Bulk Adjusted ADJUSTMENT_IN 100 at 75ad437b-9b34-41e1-b427-7cb63e236247. Reason: Initial Stock Import	\N	2026-01-19 06:29:13.493
1c0c6b90-4195-4c89-9413-700a868388fa	f0000eff-2dfa-4cad-8669-0243b1f9f51e	ADJUST_STOCK_BULK	ProductVariant	b1df47f8-bb81-4eef-92b1-257cc70a8c52	Bulk Adjusted ADJUSTMENT_IN 100 at 75ad437b-9b34-41e1-b427-7cb63e236247. Reason: Initial Stock Import	\N	2026-01-19 06:29:13.507
07af8f38-cc0e-4e35-9b39-5b5d3cc42465	f0000eff-2dfa-4cad-8669-0243b1f9f51e	ADJUST_STOCK_BULK	ProductVariant	b5b45f5d-55b7-4d8c-a7f7-9794bda116f9	Bulk Adjusted ADJUSTMENT_OUT 9 at 75ad437b-9b34-41e1-b427-7cb63e236247. Reason: Initial Stock	\N	2026-01-19 06:31:48.206
8bdefa5f-42f0-4bc8-a8da-4a6b48e32a1f	f0000eff-2dfa-4cad-8669-0243b1f9f51e	ADJUST_STOCK_BULK	ProductVariant	b5b45f5d-55b7-4d8c-a7f7-9794bda116f9	Bulk Adjusted ADJUSTMENT_OUT 82 at 75ad437b-9b34-41e1-b427-7cb63e236247. Reason: Initial Stock	\N	2026-01-19 06:32:34.941
b83693eb-bd4d-44f8-a45f-596244752454	f0000eff-2dfa-4cad-8669-0243b1f9f51e	ADJUST_STOCK_BULK	ProductVariant	68e92ebb-6fce-4483-bc9d-cc0ab1d001cb	Bulk Adjusted ADJUSTMENT_IN 1445 at 75ad437b-9b34-41e1-b427-7cb63e236247. Reason: Inital Stock	\N	2026-01-19 06:33:05.455
d9ec2061-564e-43cc-be8b-3b6f67bd19ba	f0000eff-2dfa-4cad-8669-0243b1f9f51e	ADJUST_STOCK_BULK	ProductVariant	56c57505-4059-46cf-9eea-c16dfa8e970c	Bulk Adjusted ADJUSTMENT_IN 5 at 75ad437b-9b34-41e1-b427-7cb63e236247. Reason: Initial Stock	\N	2026-01-19 06:33:34.908
6a2cc035-83f8-4d04-89bf-9d8dc0952b46	f0000eff-2dfa-4cad-8669-0243b1f9f51e	ADJUST_STOCK_BULK	ProductVariant	5fc56a9d-a649-4654-be01-40545adb299b	Bulk Adjusted ADJUSTMENT_IN 1882 at 75ad437b-9b34-41e1-b427-7cb63e236247. Reason: Initial Stock\n	\N	2026-01-19 06:34:23.273
cf1e40c1-1029-4544-bc24-23e2358fe4aa	f0000eff-2dfa-4cad-8669-0243b1f9f51e	ADJUST_STOCK_BULK	ProductVariant	5e18ea2a-2800-489c-a423-249d8074f019	Bulk Adjusted ADJUSTMENT_IN 64 at 75ad437b-9b34-41e1-b427-7cb63e236247. Reason: Initial Stock	\N	2026-01-19 06:34:43.757
96c5a460-92ce-4dfc-9773-8ec9ff74dae7	f0000eff-2dfa-4cad-8669-0243b1f9f51e	ADJUST_STOCK_BULK	ProductVariant	efb73e36-20cd-456b-8a11-64069c9a6dde	Bulk Adjusted ADJUSTMENT_IN 500 at 75ad437b-9b34-41e1-b427-7cb63e236247. Reason: Initial Stock	\N	2026-01-19 06:36:00.474
e2c673a1-40c1-428e-bf27-e402ac109314	f0000eff-2dfa-4cad-8669-0243b1f9f51e	ADJUST_STOCK_BULK	ProductVariant	c94295dc-bf84-4f89-9a76-c352b90986ce	Bulk Adjusted ADJUSTMENT_IN 900 at 75ad437b-9b34-41e1-b427-7cb63e236247. Reason: Initial Stock	\N	2026-01-19 06:36:21.331
f0e7aec5-9932-4b7f-9ecc-025bd2f79ee2	f0000eff-2dfa-4cad-8669-0243b1f9f51e	ADJUST_STOCK_BULK	ProductVariant	ba05f26d-9c26-45bf-b6e7-27f2c65a447a	Bulk Adjusted ADJUSTMENT_IN 395 at 75ad437b-9b34-41e1-b427-7cb63e236247. Reason: Initial Stock	\N	2026-01-19 06:36:44.05
43f31a5a-dd41-49dc-ad14-52e5d62ac161	f0000eff-2dfa-4cad-8669-0243b1f9f51e	ADJUST_STOCK_BULK	ProductVariant	1700703a-b14f-4677-b909-e29a1c03ec36	Bulk Adjusted ADJUSTMENT_IN 296 at 75ad437b-9b34-41e1-b427-7cb63e236247. Reason: Initial Stock	\N	2026-01-19 06:37:08.148
eb14493c-181a-4325-bc11-f4deca4d3811	f0000eff-2dfa-4cad-8669-0243b1f9f51e	ADJUST_STOCK_BULK	ProductVariant	68e92ebb-6fce-4483-bc9d-cc0ab1d001cb	Bulk Adjusted ADJUSTMENT_OUT 100 at 75ad437b-9b34-41e1-b427-7cb63e236247. Reason: Stock Revisi	\N	2026-01-19 06:38:39.7
b06bb880-45b0-4f4a-906a-25aabbb82ad3	f0000eff-2dfa-4cad-8669-0243b1f9f51e	ADJUST_STOCK_BULK	ProductVariant	56c57505-4059-46cf-9eea-c16dfa8e970c	Bulk Adjusted ADJUSTMENT_OUT 100 at 75ad437b-9b34-41e1-b427-7cb63e236247. Reason: Stock Adjustment	\N	2026-01-19 06:39:44.296
7fee9c33-1b4e-4d40-aeb6-5ed9343b8701	f0000eff-2dfa-4cad-8669-0243b1f9f51e	ADJUST_STOCK_BULK	ProductVariant	5fc56a9d-a649-4654-be01-40545adb299b	Bulk Adjusted ADJUSTMENT_OUT 100 at 75ad437b-9b34-41e1-b427-7cb63e236247. Reason: Stock Adjustment	\N	2026-01-19 06:40:01.762
2eddb62c-68bb-421f-baed-73731f95216d	f0000eff-2dfa-4cad-8669-0243b1f9f51e	ADJUST_STOCK_BULK	ProductVariant	5e18ea2a-2800-489c-a423-249d8074f019	Bulk Adjusted ADJUSTMENT_OUT 100 at 75ad437b-9b34-41e1-b427-7cb63e236247. Reason: Stock Adjustment	\N	2026-01-19 06:40:13.212
aed30896-bbb8-42cb-bd9e-2fa6a87f7605	f0000eff-2dfa-4cad-8669-0243b1f9f51e	ADJUST_STOCK_BULK	ProductVariant	efb73e36-20cd-456b-8a11-64069c9a6dde	Bulk Adjusted ADJUSTMENT_OUT 100 at 75ad437b-9b34-41e1-b427-7cb63e236247. Reason: Stock Adjustment	\N	2026-01-19 06:40:31.212
309b81c2-f94e-4400-adcf-6b477be4e573	f0000eff-2dfa-4cad-8669-0243b1f9f51e	ADJUST_STOCK_BULK	ProductVariant	c94295dc-bf84-4f89-9a76-c352b90986ce	Bulk Adjusted ADJUSTMENT_OUT 100 at 75ad437b-9b34-41e1-b427-7cb63e236247. Reason: Stock Adjustment	\N	2026-01-19 06:40:45.527
141cb0d3-26bb-4932-a91a-e81d84cf4f40	f0000eff-2dfa-4cad-8669-0243b1f9f51e	ADJUST_STOCK_BULK	ProductVariant	ba05f26d-9c26-45bf-b6e7-27f2c65a447a	Bulk Adjusted ADJUSTMENT_OUT 100 at 75ad437b-9b34-41e1-b427-7cb63e236247. Reason: Initial Stock	\N	2026-01-19 06:41:30.919
5530324c-d38b-48c0-a0e2-2ac30f87f62e	f0000eff-2dfa-4cad-8669-0243b1f9f51e	ADJUST_STOCK_BULK	ProductVariant	1700703a-b14f-4677-b909-e29a1c03ec36	Bulk Adjusted ADJUSTMENT_OUT 100 at 75ad437b-9b34-41e1-b427-7cb63e236247. Reason: Stock Adjustment	\N	2026-01-19 06:41:48.749
bb956260-c366-4ba0-982b-0353b75cfa18	f0000eff-2dfa-4cad-8669-0243b1f9f51e	ADJUST_STOCK_BULK	ProductVariant	30ecde3c-b399-4359-af4f-c98bd11c5db6	Bulk Adjusted ADJUSTMENT_IN 1270 at 75ad437b-9b34-41e1-b427-7cb63e236247. Reason: Initial Stock	\N	2026-01-19 06:42:17.58
75dfb16a-4956-4591-b747-7593cca15626	f0000eff-2dfa-4cad-8669-0243b1f9f51e	ADJUST_STOCK_BULK	ProductVariant	db9bac3b-0832-43c3-bfef-123ffe9db980	Bulk Adjusted ADJUSTMENT_IN 1270 at 75ad437b-9b34-41e1-b427-7cb63e236247. Reason: Initial Stock	\N	2026-01-19 06:42:40.852
367b542c-e54f-450e-b95b-ccfa326e6c00	f0000eff-2dfa-4cad-8669-0243b1f9f51e	ADJUST_STOCK_BULK	ProductVariant	db9bac3b-0832-43c3-bfef-123ffe9db980	Bulk Adjusted ADJUSTMENT_OUT 551 at 75ad437b-9b34-41e1-b427-7cb63e236247. Reason: Stock Adjustment	\N	2026-01-19 07:01:36.619
6c79e663-7cf5-4b82-be57-4bfcea4ebdcd	f0000eff-2dfa-4cad-8669-0243b1f9f51e	ADJUST_STOCK_BULK	ProductVariant	15298147-4624-4921-a762-da82ec5e19f1	Bulk Adjusted ADJUSTMENT_IN 175 at 75ad437b-9b34-41e1-b427-7cb63e236247. Reason: Inital Stock	\N	2026-01-19 07:02:04.353
b431cbf7-9e4b-4c35-963c-f3de0e1a1957	f0000eff-2dfa-4cad-8669-0243b1f9f51e	ADJUST_STOCK_BULK	ProductVariant	c25c2770-ec37-4d87-a1d3-bf38e0117992	Bulk Adjusted ADJUSTMENT_OUT 75 at 75ad437b-9b34-41e1-b427-7cb63e236247. Reason: Stock Adjustment	\N	2026-01-19 07:03:26.568
ae0fe047-cfda-474e-983c-139e73267eb5	f0000eff-2dfa-4cad-8669-0243b1f9f51e	ADJUST_STOCK_BULK	ProductVariant	dca00a7c-3d85-47ed-8559-da9659a102c1	Bulk Adjusted ADJUSTMENT_IN 894 at 75ad437b-9b34-41e1-b427-7cb63e236247. Reason: Initial Stock	\N	2026-01-19 07:07:04.47
2f9990c0-b553-4064-9ade-e94a566e2f78	f0000eff-2dfa-4cad-8669-0243b1f9f51e	ADJUST_STOCK_BULK	ProductVariant	03178aa0-cda1-484c-b85c-60eb6386c606	Bulk Adjusted ADJUSTMENT_OUT 100 at 75ad437b-9b34-41e1-b427-7cb63e236247. Reason: Stock Adjustment	\N	2026-01-19 07:07:21.528
b0a2ee92-a690-4936-ad3e-f42ce46359f7	f0000eff-2dfa-4cad-8669-0243b1f9f51e	ADJUST_STOCK_BULK	ProductVariant	68e92ebb-6fce-4483-bc9d-cc0ab1d001cb	Bulk Adjusted ADJUSTMENT_IN 375 at 75ad437b-9b34-41e1-b427-7cb63e236247. Reason: From Duta Baru	\N	2026-01-19 07:07:40.942
e4ec7d21-b1a3-4a46-87cd-016cc49ae391	f0000eff-2dfa-4cad-8669-0243b1f9f51e	ADJUST_STOCK_BULK	ProductVariant	e9c1e73b-4fe5-4037-9385-20bab938b240	Bulk Adjusted ADJUSTMENT_IN 850 at 75ad437b-9b34-41e1-b427-7cb63e236247. Reason: Initial Stock	\N	2026-01-19 07:08:06.731
26891ee1-facc-4994-b4eb-05c776d7cabd	f0000eff-2dfa-4cad-8669-0243b1f9f51e	ADJUST_STOCK_BULK	ProductVariant	05f32ad0-c46a-4f7e-9e1e-ad3a0967b878	Bulk Adjusted ADJUSTMENT_OUT 86 at 75ad437b-9b34-41e1-b427-7cb63e236247. Reason: Stock Adjustment	\N	2026-01-19 07:08:55.546
8ef86645-43f9-4107-a142-0c5774908e77	f0000eff-2dfa-4cad-8669-0243b1f9f51e	ADJUST_STOCK_BULK	ProductVariant	0e5d730f-9d6c-4445-b20d-b3901f8c9205	Bulk Adjusted ADJUSTMENT_IN 356 at 75ad437b-9b34-41e1-b427-7cb63e236247. Reason: Initial Stock	\N	2026-01-19 07:09:33.359
5f9938e5-4d74-4282-943a-005463eaa442	f0000eff-2dfa-4cad-8669-0243b1f9f51e	ADJUST_STOCK_BULK	ProductVariant	7a5251cc-18d8-4f78-833c-afd4fdc8c9b5	Bulk Adjusted ADJUSTMENT_IN 25 at 75ad437b-9b34-41e1-b427-7cb63e236247. Reason: Initial Stock\n	\N	2026-01-19 07:10:35.69
c3a9a9fe-a838-4e56-996d-3ca5eda82e83	f0000eff-2dfa-4cad-8669-0243b1f9f51e	ADJUST_STOCK_BULK	ProductVariant	e4d7b713-2714-4555-8378-47741a4951af	Bulk Adjusted ADJUSTMENT_IN 175 at 75ad437b-9b34-41e1-b427-7cb63e236247. Reason: Initial Stock\n	\N	2026-01-19 07:10:05.333
e4046c5a-e56c-4ed4-9fc2-d31e1b2e9ac2	f0000eff-2dfa-4cad-8669-0243b1f9f51e	ADJUST_STOCK_BULK	ProductVariant	f7eb4c8c-6e14-4709-9590-1bebf0633feb	Bulk Adjusted ADJUSTMENT_OUT 100 at 75ad437b-9b34-41e1-b427-7cb63e236247. Reason: Initial Stock	\N	2026-01-19 07:12:41.048
c2ebec19-1fb5-492c-86c1-30c36c2682c6	f0000eff-2dfa-4cad-8669-0243b1f9f51e	ADJUST_STOCK_BULK	ProductVariant	534c06cf-cf1f-4014-bdfc-e99820d04469	Bulk Adjusted ADJUSTMENT_IN 75 at 75ad437b-9b34-41e1-b427-7cb63e236247. Reason: Initial Stock	\N	2026-01-19 07:11:03.362
ce3af6bb-01b2-4784-b1fb-136a9bc37a36	f0000eff-2dfa-4cad-8669-0243b1f9f51e	ADJUST_STOCK_BULK	ProductVariant	5f44845e-fbae-4fd8-8338-5b6cad10fbd1	Bulk Adjusted ADJUSTMENT_IN 75 at 75ad437b-9b34-41e1-b427-7cb63e236247. Reason: Initial Stock	\N	2026-01-19 07:11:26.37
07b108bb-ad5d-4f5c-a090-2ea431ad85ae	f0000eff-2dfa-4cad-8669-0243b1f9f51e	ADJUST_STOCK_BULK	ProductVariant	94fff4c0-f8c1-4451-933c-8e6a19efc41d	Bulk Adjusted ADJUSTMENT_IN 250 at 75ad437b-9b34-41e1-b427-7cb63e236247. Reason: Initial Stock	\N	2026-01-19 07:12:16.976
f7401e64-0690-451f-88c5-fb3b408a78a5	f0000eff-2dfa-4cad-8669-0243b1f9f51e	ADJUST_STOCK_BULK	ProductVariant	4b88c5d3-24ea-45c3-90db-c19715eb600e	Bulk Adjusted ADJUSTMENT_OUT 70 at 75ad437b-9b34-41e1-b427-7cb63e236247. Reason: Initial Stock	\N	2026-01-19 07:13:07.171
f87a9500-8a65-4b21-9485-ff4754a24ffb	f0000eff-2dfa-4cad-8669-0243b1f9f51e	ADJUST_STOCK_BULK	ProductVariant	65baaa0c-defe-4c8d-87bf-9b2ab2a0874a	Bulk Adjusted ADJUSTMENT_IN 110 at 0452f60e-9518-4a8b-ad5b-5e6d46297c4a. Reason: Initial stock	\N	2026-01-19 07:14:23.943
a8982ecc-192a-4a4d-9660-b644ab6f2a76	f0000eff-2dfa-4cad-8669-0243b1f9f51e	ADJUST_STOCK_BULK	ProductVariant	ce7f996e-3a3b-4d93-bbb1-52c818f9e779	Bulk Adjusted ADJUSTMENT_IN 339 at 0452f60e-9518-4a8b-ad5b-5e6d46297c4a. Reason: Initial Stock	\N	2026-01-19 07:15:01.336
71a1cde0-3947-4575-bd8d-e0fe7ede02cf	f0000eff-2dfa-4cad-8669-0243b1f9f51e	ADJUST_STOCK_BULK	ProductVariant	9dda0cd7-31bb-469e-8891-fe88c5e01d33	Bulk Adjusted ADJUSTMENT_IN 561 at 0452f60e-9518-4a8b-ad5b-5e6d46297c4a. Reason: Initial Stock	\N	2026-01-19 07:15:28.883
c0b5b6d7-3dfa-45e9-9bc9-2761a6a27e1a	f0000eff-2dfa-4cad-8669-0243b1f9f51e	ADJUST_STOCK_BULK	ProductVariant	c325b4c0-73d7-4aff-b9bf-52d72bbda84c	Bulk Adjusted ADJUSTMENT_IN 562 at 0452f60e-9518-4a8b-ad5b-5e6d46297c4a. Reason: Initial Stock	\N	2026-01-19 07:16:26.304
869e7f82-01d1-4aea-82d0-77ae60d2e239	f0000eff-2dfa-4cad-8669-0243b1f9f51e	ADJUST_STOCK_BULK	ProductVariant	0c41e285-16e5-4ba1-b688-8cde225e9d21	Bulk Adjusted ADJUSTMENT_IN 358 at 0452f60e-9518-4a8b-ad5b-5e6d46297c4a. Reason: Initial Stock	\N	2026-01-19 08:42:13.465
7058655d-1c0f-4811-9345-f1cb7352d4ed	f0000eff-2dfa-4cad-8669-0243b1f9f51e	ADJUST_STOCK_BULK	ProductVariant	e5c741e6-7652-4e66-92c1-c80587df7b86	Bulk Adjusted ADJUSTMENT_IN 400 at 0452f60e-9518-4a8b-ad5b-5e6d46297c4a. Reason: Initial Stock	\N	2026-01-19 08:42:37.375
70101d61-bfea-4221-91de-9fa139c12f44	f0000eff-2dfa-4cad-8669-0243b1f9f51e	ADJUST_STOCK_BULK	ProductVariant	976d3eba-a011-4d35-9773-d5b4dd613551	Bulk Adjusted ADJUSTMENT_IN 110 at 0452f60e-9518-4a8b-ad5b-5e6d46297c4a. Reason: Initial Stock	\N	2026-01-19 08:44:28.31
678f9a1b-383b-4838-b3d1-d3793fde2d89	f0000eff-2dfa-4cad-8669-0243b1f9f51e	ADJUST_STOCK_BULK	ProductVariant	976d3eba-a011-4d35-9773-d5b4dd613551	Bulk Adjusted ADJUSTMENT_IN 165 at 0452f60e-9518-4a8b-ad5b-5e6d46297c4a. Reason: Stock Adjustment	\N	2026-01-19 08:44:51.09
d8e7bf59-205f-4e42-989f-b060ad098fea	f0000eff-2dfa-4cad-8669-0243b1f9f51e	ADJUST_STOCK_BULK	ProductVariant	67afcf50-f8a2-4dea-ad11-733acc19682f	Bulk Adjusted ADJUSTMENT_IN 1155 at 0452f60e-9518-4a8b-ad5b-5e6d46297c4a. Reason: Initial Stock	\N	2026-01-19 08:46:41.627
ecd8643c-45e3-48db-98d2-ca0fbfeaa618	f0000eff-2dfa-4cad-8669-0243b1f9f51e	ADJUST_STOCK_BULK	ProductVariant	0fc1f30b-43d3-4f84-8876-5402bc8c5e65	Bulk Adjusted ADJUSTMENT_IN 588 at 0452f60e-9518-4a8b-ad5b-5e6d46297c4a. Reason: Initial Stock	\N	2026-01-19 08:48:14.162
4f9e149d-4f04-4537-9349-be1b75b44b1c	f0000eff-2dfa-4cad-8669-0243b1f9f51e	ADJUST_STOCK_BULK	ProductVariant	0da6d9f3-6a7c-492f-a204-d82b86a36b5f	Bulk Adjusted ADJUSTMENT_IN 381 at 0452f60e-9518-4a8b-ad5b-5e6d46297c4a. Reason: Initial Stock	\N	2026-01-19 08:48:34.592
d4b2f04c-0ac7-4c29-9393-6bb85bd17c89	f0000eff-2dfa-4cad-8669-0243b1f9f51e	ADJUST_STOCK_BULK	ProductVariant	53d5fd3f-f333-4961-b244-6d7220b29d1d	Bulk Adjusted ADJUSTMENT_IN 479 at 0452f60e-9518-4a8b-ad5b-5e6d46297c4a. Reason: Initial Stock	\N	2026-01-19 08:48:55.146
e9cd264d-ffb0-4878-8821-06dedf9d8319	f0000eff-2dfa-4cad-8669-0243b1f9f51e	ADJUST_STOCK_BULK	ProductVariant	b903b729-2e91-44ee-b83c-b3c5554e49a0	Bulk Adjusted ADJUSTMENT_IN 166 at 0452f60e-9518-4a8b-ad5b-5e6d46297c4a. Reason: Initial Stock	\N	2026-01-19 08:49:25.838
7654fcb9-a751-47d7-935b-4e3b30d6c645	f0000eff-2dfa-4cad-8669-0243b1f9f51e	ADJUST_STOCK_BULK	ProductVariant	dd7a7330-3851-4747-bdec-46d339148e9f	Bulk Adjusted ADJUSTMENT_IN 324 at 0452f60e-9518-4a8b-ad5b-5e6d46297c4a. Reason: Initial Stock	\N	2026-01-19 08:49:55.475
77d321de-2901-432f-bfbb-d5152936b125	f0000eff-2dfa-4cad-8669-0243b1f9f51e	ADJUST_STOCK_BULK	ProductVariant	41c20290-7fe7-46da-afb9-8bfe11077d05	Bulk Adjusted ADJUSTMENT_IN 543 at 0452f60e-9518-4a8b-ad5b-5e6d46297c4a. Reason: Initial Stock	\N	2026-01-19 08:50:23.922
707a2641-4a1e-4d07-bcb2-e2e285e3d655	f0000eff-2dfa-4cad-8669-0243b1f9f51e	ADJUST_STOCK_BULK	ProductVariant	c07a7d2d-a068-4f33-adac-00af64ce08d3	Bulk Adjusted ADJUSTMENT_IN 54 at 0452f60e-9518-4a8b-ad5b-5e6d46297c4a. Reason: Initial Stock	\N	2026-01-19 08:51:10.602
c633758e-a558-4efd-a5e9-3463054cb014	f0000eff-2dfa-4cad-8669-0243b1f9f51e	ADJUST_STOCK_BULK	ProductVariant	510fe8a8-1a9f-4439-bdd2-7ed9a4dddd1a	Bulk Adjusted ADJUSTMENT_IN 57 at 0452f60e-9518-4a8b-ad5b-5e6d46297c4a. Reason: Initial Stock	\N	2026-01-19 08:52:26.754
e691ff93-a4f4-4883-b94d-7cbe19332b35	f0000eff-2dfa-4cad-8669-0243b1f9f51e	ADJUST_STOCK_BULK	ProductVariant	48c41b36-7cad-49d6-9f2c-94e7bce32725	Bulk Adjusted ADJUSTMENT_IN 60 at 0452f60e-9518-4a8b-ad5b-5e6d46297c4a. Reason: Initial Stock	\N	2026-01-19 08:52:49.464
6c9ff0e0-ad24-4416-a14c-33795ca78e8b	f0000eff-2dfa-4cad-8669-0243b1f9f51e	ADJUST_STOCK_BULK	ProductVariant	c35a2345-0a2c-471f-a6e8-32e0589c1576	Bulk Adjusted ADJUSTMENT_IN 43 at 0452f60e-9518-4a8b-ad5b-5e6d46297c4a. Reason: Initial Stock	\N	2026-01-19 08:53:31.552
34a0defe-6364-46ee-8a4e-197327d95af5	f0000eff-2dfa-4cad-8669-0243b1f9f51e	ADJUST_STOCK_BULK	ProductVariant	e61096c6-92b5-4b46-b828-3a2a25bf6fb6	Bulk Adjusted ADJUSTMENT_IN 220 at 0452f60e-9518-4a8b-ad5b-5e6d46297c4a. Reason: Initial Stock	\N	2026-01-19 08:53:59.449
4734b876-4745-4b10-bb2b-360b46c6bf16	f0000eff-2dfa-4cad-8669-0243b1f9f51e	ADJUST_STOCK_BULK	ProductVariant	979d2b8f-b2c6-4a97-b578-ac58daa29d36	Bulk Adjusted ADJUSTMENT_IN 303 at 0452f60e-9518-4a8b-ad5b-5e6d46297c4a. Reason: Initial Stock	\N	2026-01-19 08:56:37.497
f904529b-a451-421c-af05-f2f051a2f67a	f0000eff-2dfa-4cad-8669-0243b1f9f51e	ADJUST_STOCK_BULK	ProductVariant	68e92ebb-6fce-4483-bc9d-cc0ab1d001cb	Bulk Adjusted ADJUSTMENT_IN 375 at 75ad437b-9b34-41e1-b427-7cb63e236247. Reason: Pelled From Duta Baru	\N	2026-01-21 01:40:30.359
927368be-e12f-43f8-bcd9-6cf6d89aba10	a8971ec0-a686-43b0-aec0-53d383321331	ADJUST_STOCK_BULK	ProductVariant	68e92ebb-6fce-4483-bc9d-cc0ab1d001cb	Bulk Adjusted ADJUSTMENT_OUT 375 at 75ad437b-9b34-41e1-b427-7cb63e236247. Reason: Stock Adjustment	\N	2026-01-21 01:43:26.309
7e7b1d64-76b2-4acd-929a-bcb95cf14c02	a8971ec0-a686-43b0-aec0-53d383321331	UPDATE_STATUS_PURCHASE	PurchaseOrder	23fd708f-f39e-4db6-9b63-45a116b06a66	Updated PO PO-2026-0001 status to SENT	\N	2026-01-21 01:45:06.52
32d6445e-95b1-44db-b817-f7de5842a76d	a8971ec0-a686-43b0-aec0-53d383321331	RECEIVE_PURCHASE	GoodsReceipt	492e9f1b-c4d1-4407-b3ef-d3ce9e28b534	Received items for PO PO-2026-0001 via GR GR-2026-0001	\N	2026-01-21 01:45:18.622
85952576-f9db-4407-aa93-63b73bccce1d	f0000eff-2dfa-4cad-8669-0243b1f9f51e	UPDATE_STATUS_PURCHASE	PurchaseOrder	92399630-81ec-4ef5-ada1-32b0c7ff3e11	Updated PO PO-2026-0002 status to SENT	\N	2026-01-21 02:18:54.048
6441876c-d50e-4109-bc0d-af83985331c3	f0000eff-2dfa-4cad-8669-0243b1f9f51e	RECEIVE_PURCHASE	GoodsReceipt	0200ae89-00fa-4631-94f9-1cf36829b012	Received items for PO PO-2026-0002 via GR GR-2026-0002	\N	2026-01-21 02:19:14.538
ffd58e3e-3609-434f-b84f-650e7435ee97	f0000eff-2dfa-4cad-8669-0243b1f9f51e	ADJUST_STOCK_BULK	ProductVariant	dca00a7c-3d85-47ed-8559-da9659a102c1	Bulk Adjusted ADJUSTMENT_OUT 1070 at 75ad437b-9b34-41e1-b427-7cb63e236247. Reason: Initial Stock	\N	2026-01-21 02:24:50.377
a24dec8a-977c-438b-9b00-1978e77f2ee1	f0000eff-2dfa-4cad-8669-0243b1f9f51e	CONFIRM_SALES	SalesOrder	07ebed5c-9874-4766-b6e9-0db5440e4dd1	Sales Order SO-2026-0001 confirmed. Status: IN_PRODUCTION	\N	2026-01-21 03:03:26.976
1eb0f81a-0ffd-4060-a2cf-6be991d92c6d	f0000eff-2dfa-4cad-8669-0243b1f9f51e	UPDATE_SALES_STATUS	SalesOrder	07ebed5c-9874-4766-b6e9-0db5440e4dd1	Sales Order SO-2026-0001 marked as Ready to Ship	\N	2026-01-21 03:03:29.381
061f9529-c272-4a83-9bee-36108045a953	f0000eff-2dfa-4cad-8669-0243b1f9f51e	SHIP_SALES	SalesOrder	07ebed5c-9874-4766-b6e9-0db5440e4dd1	Sales Order SO-2026-0001 shipped	\N	2026-01-21 03:03:32.944
010e1f49-aa79-4fcb-98d8-80b01cbdd94f	f0000eff-2dfa-4cad-8669-0243b1f9f51e	CREATE_INVOICE	Invoice	2117d921-434a-4afb-a7b0-73b403c7984c	Invoice INV-20260121-0001 created for Order SO-2026-0001	\N	2026-01-21 03:03:48.332
\.


--
-- Data for Name: Batch; Type: TABLE DATA; Schema: public; Owner: polyflow
--

COPY public."Batch" (id, "batchNumber", "productVariantId", "locationId", quantity, "manufacturingDate", "expiryDate", status, "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: Bom; Type: TABLE DATA; Schema: public; Owner: polyflow
--

COPY public."Bom" (id, name, description, "productVariantId", "outputQuantity", "isDefault", "createdAt", "updatedAt") FROM stdin;
139aa05f-01db-41b8-b42a-8d368f9cc44c	F-HUR-004 	\N	0635d93b-ffbe-403d-8a05-bb2835cf4d73	109.8000	f	2026-01-19 08:37:39.74	2026-01-20 04:39:17.405
6b27dbeb-0963-4741-b97f-03afeed39f2b	F-HMP-003 	\N	135f559a-fde6-418f-bc4b-8d305fa2fdf6	100.1200	f	2026-01-19 09:10:45.492	2026-01-20 04:45:16.168
ea158f6c-5651-447c-842a-fb5b303cc93a	F-HMP-007	\N	380cb5ef-cae6-4a06-8f99-e14ad7850bb4	100.0100	f	2026-01-20 04:48:39.654	2026-01-20 04:49:38.063
911bbd8e-6aea-4b27-90fa-40e4e376bcce	F-HMP-003 (V1)	\N	02f84342-0b5a-4f49-b235-69a874684f36	100.0200	f	2026-01-20 04:53:31.457	2026-01-20 04:53:31.457
d8af28ca-f774-483f-82e9-cc31fd2564b3	F-HMP-003 (V2)	\N	02f84342-0b5a-4f49-b235-69a874684f36	100.0150	f	2026-01-20 04:55:22.131	2026-01-20 04:55:54.922
c2e09623-337f-4ecc-bc52-02e4ea484050	F-HUR-000 (V8)	\N	0635d93b-ffbe-403d-8a05-bb2835cf4d73	104.3000	f	2026-01-20 05:05:34.376	2026-01-20 06:28:34.5
3530f181-9c91-4839-b824-c58d1b7800e2	F-HUR-001 	\N	0635d93b-ffbe-403d-8a05-bb2835cf4d73	102.7000	f	2026-01-20 08:03:21.524	2026-01-20 08:03:21.524
5fbcd7c4-c7b2-4343-8bf0-577a0bade58e	F-HUR-000 (V9)	\N	0635d93b-ffbe-403d-8a05-bb2835cf4d73	103.3000	f	2026-01-20 08:08:41.894	2026-01-20 08:08:41.894
5d5ae616-7537-467b-a475-17797c379002	F-HBJ-003	\N	e20bba24-260f-4333-9ad6-7b70b32c9c41	100.3000	f	2026-01-20 08:37:41.065	2026-01-20 08:37:41.065
40c18c61-bc88-4b27-938c-c66706203214	F-HMJ-003	\N	29b14218-c384-4b58-90fa-bbde1b923e46	101.3000	f	2026-01-20 08:40:51.742	2026-01-20 08:40:51.742
2a9a860d-0bd5-4d09-8955-9a0dbe399492	F-HHJ-003	\N	f7653b4c-9b8a-4905-ac15-3cdc41afb342	100.3000	f	2026-01-20 08:42:26.521	2026-01-20 08:42:26.521
af23fc68-4213-4d74-925f-81d8162d06bd	F-HOJ-003	\N	80b4a915-29ed-44f9-8b3a-2036877e49b9	100.3000	f	2026-01-20 08:49:49.464	2026-01-20 08:49:49.464
1a1a5ebb-e4cb-4244-bb40-b18c06298b93	F-HKJ-003	\N	e0186b2d-742e-4526-8500-08a5ea4a0a44	102.3000	f	2026-01-20 08:55:54.603	2026-01-20 08:55:54.603
89c08b84-b4f6-4650-b921-53fd9123c113	F-HPJ-003	\N	e386871b-e654-463d-968a-c67370387d04	101.3000	f	2026-01-20 08:59:51.264	2026-01-20 08:59:51.264
e24a2374-3af7-49ac-b59b-21ce76e8c31e	F-PGO-000	\N	3e853398-9217-4ce9-a6df-13d87fda3632	100.0100	f	2026-01-21 01:24:11.923	2026-01-21 01:24:11.923
c95eb05d-8c1d-4319-bb78-47aee39f5464	HD Ungu Ekstru	\N	03178aa0-cda1-484c-b85c-60eb6386c606	549.0000	f	2026-01-21 02:54:02.655	2026-01-21 02:54:02.655
\.


--
-- Data for Name: BomItem; Type: TABLE DATA; Schema: public; Owner: polyflow
--

COPY public."BomItem" (id, "bomId", "productVariantId", quantity, "scrapPercentage", "createdAt", "updatedAt") FROM stdin;
4ac2935e-ae23-4d14-811f-6ce8364020b3	911bbd8e-6aea-4b27-90fa-40e4e376bcce	56c57505-4059-46cf-9eea-c16dfa8e970c	40.0000	0.00	2026-01-20 04:53:31.457	2026-01-20 04:53:31.457
cb788aef-de53-4e1a-8e46-ca2c78901075	911bbd8e-6aea-4b27-90fa-40e4e376bcce	b5b45f5d-55b7-4d8c-a7f7-9794bda116f9	20.0000	0.00	2026-01-20 04:53:31.457	2026-01-20 04:53:31.457
55ead4bb-1ef1-498a-ac40-a421d650c9b5	911bbd8e-6aea-4b27-90fa-40e4e376bcce	68e92ebb-6fce-4483-bc9d-cc0ab1d001cb	15.0000	0.00	2026-01-20 04:53:31.457	2026-01-20 04:53:31.457
68888ade-cd1f-40e4-b95b-1bec9abc3b33	911bbd8e-6aea-4b27-90fa-40e4e376bcce	15298147-4624-4921-a762-da82ec5e19f1	15.0000	0.00	2026-01-20 04:53:31.457	2026-01-20 04:53:31.457
6f584bd7-535a-49e1-b38b-dff9e53d540d	911bbd8e-6aea-4b27-90fa-40e4e376bcce	efb73e36-20cd-456b-8a11-64069c9a6dde	5.0000	0.00	2026-01-20 04:53:31.457	2026-01-20 04:53:31.457
7398dfb0-d89f-4832-8681-226d3ab6db3a	911bbd8e-6aea-4b27-90fa-40e4e376bcce	30ecde3c-b399-4359-af4f-c98bd11c5db6	5.0000	0.00	2026-01-20 04:53:31.457	2026-01-20 04:53:31.457
3406ade9-2f42-4e7f-86ff-b63d9f898026	911bbd8e-6aea-4b27-90fa-40e4e376bcce	b1df47f8-bb81-4eef-92b1-257cc70a8c52	0.0200	0.00	2026-01-20 04:53:31.457	2026-01-20 04:53:31.457
95a3eece-f5fa-4900-83cc-47f395de8ee9	3530f181-9c91-4839-b824-c58d1b7800e2	b5b45f5d-55b7-4d8c-a7f7-9794bda116f9	25.0000	0.00	2026-01-20 08:03:21.524	2026-01-20 08:03:21.524
4556529c-3158-4fe1-99eb-1e191fa16dec	3530f181-9c91-4839-b824-c58d1b7800e2	dca00a7c-3d85-47ed-8559-da9659a102c1	25.0000	0.00	2026-01-20 08:03:21.524	2026-01-20 08:03:21.524
69f795b6-7a60-45a6-a251-0fae0b6db6d3	3530f181-9c91-4839-b824-c58d1b7800e2	5fc56a9d-a649-4654-be01-40545adb299b	30.0000	0.00	2026-01-20 08:03:21.524	2026-01-20 08:03:21.524
c1561e19-c893-4130-b8a8-1074970b3d82	3530f181-9c91-4839-b824-c58d1b7800e2	db9bac3b-0832-43c3-bfef-123ffe9db980	10.0000	0.00	2026-01-20 08:03:21.524	2026-01-20 08:03:21.524
4b981be3-20bc-4740-913d-484e60b6a466	3530f181-9c91-4839-b824-c58d1b7800e2	c94295dc-bf84-4f89-9a76-c352b90986ce	10.0000	0.00	2026-01-20 08:03:21.524	2026-01-20 08:03:21.524
81533820-6127-4bdd-bf5e-b009bc6fd746	3530f181-9c91-4839-b824-c58d1b7800e2	16ff1042-ff62-463e-a352-c0dd5cfcdc7c	2.3000	0.00	2026-01-20 08:03:21.524	2026-01-20 08:03:21.524
7c9b995b-7263-4bfe-95bb-0964d1bda729	3530f181-9c91-4839-b824-c58d1b7800e2	4b88c5d3-24ea-45c3-90db-c19715eb600e	0.4000	0.00	2026-01-20 08:03:21.524	2026-01-20 08:03:21.524
bd81749b-2ebe-4c87-a55b-12d32c667bf3	5d5ae616-7537-467b-a475-17797c379002	56c57505-4059-46cf-9eea-c16dfa8e970c	73.0000	0.00	2026-01-20 08:37:41.065	2026-01-20 08:37:41.065
acc7f84b-7599-4db1-93ed-067b1f2dc1a3	5d5ae616-7537-467b-a475-17797c379002	15298147-4624-4921-a762-da82ec5e19f1	10.0000	0.00	2026-01-20 08:37:41.065	2026-01-20 08:37:41.065
b3109f54-626f-4a2d-875a-06396ed16ee5	5d5ae616-7537-467b-a475-17797c379002	30ecde3c-b399-4359-af4f-c98bd11c5db6	5.0000	0.00	2026-01-20 08:37:41.065	2026-01-20 08:37:41.065
73e0a54b-ecb8-42f9-b03a-e88b79b41443	5d5ae616-7537-467b-a475-17797c379002	db9bac3b-0832-43c3-bfef-123ffe9db980	10.0000	0.00	2026-01-20 08:37:41.065	2026-01-20 08:37:41.065
9a4e9c96-6271-4404-903d-ef0afb646340	5d5ae616-7537-467b-a475-17797c379002	c25c2770-ec37-4d87-a1d3-bf38e0117992	0.3000	0.00	2026-01-20 08:37:41.065	2026-01-20 08:37:41.065
2e2c2beb-d6ee-4466-a683-9789e15be571	5d5ae616-7537-467b-a475-17797c379002	13456454-f06b-4b92-adf1-f362a7aa4dbd	2.0000	0.00	2026-01-20 08:37:41.065	2026-01-20 08:37:41.065
3869defd-821f-4461-ade6-339dadda1989	40c18c61-bc88-4b27-938c-c66706203214	db9bac3b-0832-43c3-bfef-123ffe9db980	10.0000	0.00	2026-01-20 08:40:51.742	2026-01-20 08:40:51.742
f9e25277-002a-4055-9e15-5a6ef2be16ca	40c18c61-bc88-4b27-938c-c66706203214	c25c2770-ec37-4d87-a1d3-bf38e0117992	0.3000	0.00	2026-01-20 08:40:51.742	2026-01-20 08:40:51.742
960b93b4-9abf-431f-9cf6-463501cb7291	40c18c61-bc88-4b27-938c-c66706203214	133db924-885f-44ae-b38b-31998f6a3ad8	3.0000	0.00	2026-01-20 08:40:51.742	2026-01-20 08:40:51.742
67002013-652b-496d-9f82-8273f543e769	2a9a860d-0bd5-4d09-8955-9a0dbe399492	56c57505-4059-46cf-9eea-c16dfa8e970c	73.0000	0.00	2026-01-20 08:42:26.521	2026-01-20 08:42:26.521
c94886da-ae11-428e-850c-8933d297298e	2a9a860d-0bd5-4d09-8955-9a0dbe399492	15298147-4624-4921-a762-da82ec5e19f1	10.0000	0.00	2026-01-20 08:42:26.521	2026-01-20 08:42:26.521
cfca9b46-605e-45f3-8dce-cf6f6fde73d7	2a9a860d-0bd5-4d09-8955-9a0dbe399492	30ecde3c-b399-4359-af4f-c98bd11c5db6	5.0000	0.00	2026-01-20 08:42:26.521	2026-01-20 08:42:26.521
fa4bcfc3-81be-4bf0-8094-583dd3158084	2a9a860d-0bd5-4d09-8955-9a0dbe399492	db9bac3b-0832-43c3-bfef-123ffe9db980	10.0000	0.00	2026-01-20 08:42:26.521	2026-01-20 08:42:26.521
bf6c2dc2-ff32-4c4f-96ae-42fea7963a7c	2a9a860d-0bd5-4d09-8955-9a0dbe399492	465b0621-317c-4f66-9dbf-d216568070d5	1.5000	0.00	2026-01-20 08:42:26.521	2026-01-20 08:42:26.521
421cfe1d-16c2-4806-8f3e-24ec92b4b864	2a9a860d-0bd5-4d09-8955-9a0dbe399492	dc4a45b1-f788-46b3-8dee-d3fc40b43fb1	0.5000	0.00	2026-01-20 08:42:26.521	2026-01-20 08:42:26.521
35745342-95ee-4e26-bb92-9ab903de9e4f	2a9a860d-0bd5-4d09-8955-9a0dbe399492	c25c2770-ec37-4d87-a1d3-bf38e0117992	0.3000	0.00	2026-01-20 08:42:26.521	2026-01-20 08:42:26.521
598e077f-2e14-4418-9d40-8910384e6256	af23fc68-4213-4d74-925f-81d8162d06bd	56c57505-4059-46cf-9eea-c16dfa8e970c	73.0000	0.00	2026-01-20 08:49:49.464	2026-01-20 08:49:49.464
d39ff8b7-e2e1-4ed0-a8f1-688bf2336f31	af23fc68-4213-4d74-925f-81d8162d06bd	15298147-4624-4921-a762-da82ec5e19f1	10.0000	0.00	2026-01-20 08:49:49.464	2026-01-20 08:49:49.464
e7efb3cf-f5fd-43e8-9600-5ff2caa75c49	af23fc68-4213-4d74-925f-81d8162d06bd	30ecde3c-b399-4359-af4f-c98bd11c5db6	5.0000	0.00	2026-01-20 08:49:49.464	2026-01-20 08:49:49.464
b5a3e1a2-f1eb-4b44-a556-683fbb373354	af23fc68-4213-4d74-925f-81d8162d06bd	db9bac3b-0832-43c3-bfef-123ffe9db980	10.0000	0.00	2026-01-20 08:49:49.464	2026-01-20 08:49:49.464
43c89f05-092d-49d1-b9e8-748ccdf0c337	af23fc68-4213-4d74-925f-81d8162d06bd	c25c2770-ec37-4d87-a1d3-bf38e0117992	0.3000	0.00	2026-01-20 08:49:49.464	2026-01-20 08:49:49.464
79dd8099-822d-4422-9ee0-62b2d6c0473e	af23fc68-4213-4d74-925f-81d8162d06bd	3f13d8e5-c7fd-4fb8-8cfc-9d7abc8257ad	2.0000	0.00	2026-01-20 08:49:49.464	2026-01-20 08:49:49.464
48adef1c-4524-4309-b749-16ddddb872a8	1a1a5ebb-e4cb-4244-bb40-b18c06298b93	56c57505-4059-46cf-9eea-c16dfa8e970c	73.0000	0.00	2026-01-20 08:55:54.603	2026-01-20 08:55:54.603
e50a28b1-fa6f-4b85-a27a-06658f89bcfa	1a1a5ebb-e4cb-4244-bb40-b18c06298b93	15298147-4624-4921-a762-da82ec5e19f1	10.0000	0.00	2026-01-20 08:55:54.603	2026-01-20 08:55:54.603
271b106b-d985-440b-ad95-fae754090659	1a1a5ebb-e4cb-4244-bb40-b18c06298b93	30ecde3c-b399-4359-af4f-c98bd11c5db6	5.0000	0.00	2026-01-20 08:55:54.603	2026-01-20 08:55:54.603
99f74e03-0942-4eef-a9f2-423cbb170342	1a1a5ebb-e4cb-4244-bb40-b18c06298b93	db9bac3b-0832-43c3-bfef-123ffe9db980	10.0000	0.00	2026-01-20 08:55:54.603	2026-01-20 08:55:54.603
f8a94a4c-95ed-4e4f-831b-a01ee82a65ca	1a1a5ebb-e4cb-4244-bb40-b18c06298b93	c25c2770-ec37-4d87-a1d3-bf38e0117992	0.3000	0.00	2026-01-20 08:55:54.603	2026-01-20 08:55:54.603
e65fe48c-9950-486b-8bea-17e8f4a2811b	1a1a5ebb-e4cb-4244-bb40-b18c06298b93	1a271240-409d-4e70-9bd0-754814a60655	4.0000	0.00	2026-01-20 08:55:54.603	2026-01-20 08:55:54.603
dd234117-8c06-4d85-a412-8c8ec2bdfd54	89c08b84-b4f6-4650-b921-53fd9123c113	56c57505-4059-46cf-9eea-c16dfa8e970c	73.0000	0.00	2026-01-20 08:59:51.264	2026-01-20 08:59:51.264
b0d7166e-c5e8-485c-a2cb-f8bd21c043c0	89c08b84-b4f6-4650-b921-53fd9123c113	15298147-4624-4921-a762-da82ec5e19f1	10.0000	0.00	2026-01-20 08:59:51.264	2026-01-20 08:59:51.264
e8912148-f860-4adc-a6af-c10cfbf3f431	89c08b84-b4f6-4650-b921-53fd9123c113	30ecde3c-b399-4359-af4f-c98bd11c5db6	5.0000	0.00	2026-01-20 08:59:51.264	2026-01-20 08:59:51.264
a47c508b-2f75-40ab-85b8-d33099170e91	89c08b84-b4f6-4650-b921-53fd9123c113	db9bac3b-0832-43c3-bfef-123ffe9db980	10.0000	0.00	2026-01-20 08:59:51.264	2026-01-20 08:59:51.264
8303fce8-9c6c-4789-a6c5-e527de002532	89c08b84-b4f6-4650-b921-53fd9123c113	c25c2770-ec37-4d87-a1d3-bf38e0117992	0.3000	0.00	2026-01-20 08:59:51.264	2026-01-20 08:59:51.264
238faa8b-b138-48ec-9473-b8429a15aec7	89c08b84-b4f6-4650-b921-53fd9123c113	2368fd60-5592-47fd-a97d-daf760ea17da	3.0000	0.00	2026-01-20 08:59:51.264	2026-01-20 08:59:51.264
677bad42-1393-48fd-99ca-14fa73a8a393	e24a2374-3af7-49ac-b59b-21ce76e8c31e	1700703a-b14f-4677-b909-e29a1c03ec36	40.0000	0.00	2026-01-21 01:24:11.923	2026-01-21 01:24:11.923
ccd7a80c-998c-4bc1-8aa2-a707990f7474	ea158f6c-5651-447c-842a-fb5b303cc93a	56c57505-4059-46cf-9eea-c16dfa8e970c	40.0000	0.00	2026-01-20 04:49:38.07	2026-01-20 04:49:38.07
6fa94795-669f-4908-af23-a78f6c18bdea	ea158f6c-5651-447c-842a-fb5b303cc93a	b5b45f5d-55b7-4d8c-a7f7-9794bda116f9	10.0000	0.00	2026-01-20 04:49:38.07	2026-01-20 04:49:38.07
9fac25d4-3788-4387-9905-55c7ed15cbb3	ea158f6c-5651-447c-842a-fb5b303cc93a	68e92ebb-6fce-4483-bc9d-cc0ab1d001cb	20.0000	0.00	2026-01-20 04:49:38.07	2026-01-20 04:49:38.07
19415017-1886-44e4-a08b-66cb9df30108	ea158f6c-5651-447c-842a-fb5b303cc93a	15298147-4624-4921-a762-da82ec5e19f1	10.0000	0.00	2026-01-20 04:49:38.07	2026-01-20 04:49:38.07
99b2aad5-7aef-4465-9e69-99a1433b6353	ea158f6c-5651-447c-842a-fb5b303cc93a	db9bac3b-0832-43c3-bfef-123ffe9db980	15.0000	0.00	2026-01-20 04:49:38.07	2026-01-20 04:49:38.07
faf61586-7090-42de-99ae-e9287d04a132	ea158f6c-5651-447c-842a-fb5b303cc93a	30ecde3c-b399-4359-af4f-c98bd11c5db6	5.0000	0.00	2026-01-20 04:49:38.07	2026-01-20 04:49:38.07
436213ec-0a58-44e1-9b32-8fde317518cf	ea158f6c-5651-447c-842a-fb5b303cc93a	b1df47f8-bb81-4eef-92b1-257cc70a8c52	0.0100	0.00	2026-01-20 04:49:38.07	2026-01-20 04:49:38.07
e65f4eb3-6325-4e7e-a372-3061014ea85f	139aa05f-01db-41b8-b42a-8d368f9cc44c	5fc56a9d-a649-4654-be01-40545adb299b	50.0000	0.00	2026-01-20 04:39:17.413	2026-01-20 04:39:17.413
b9761772-7d4e-4e13-9626-d6a0ed7bb07d	139aa05f-01db-41b8-b42a-8d368f9cc44c	c94295dc-bf84-4f89-9a76-c352b90986ce	20.0000	0.00	2026-01-20 04:39:17.413	2026-01-20 04:39:17.413
9a2eaed0-cbba-42dd-a84e-5f99b9c0ca5b	139aa05f-01db-41b8-b42a-8d368f9cc44c	94fff4c0-f8c1-4451-933c-8e6a19efc41d	5.0000	0.00	2026-01-20 04:39:17.413	2026-01-20 04:39:17.413
999355dd-f669-445f-8512-9995a5479043	139aa05f-01db-41b8-b42a-8d368f9cc44c	dca00a7c-3d85-47ed-8559-da9659a102c1	10.0000	0.00	2026-01-20 04:39:17.413	2026-01-20 04:39:17.413
76afe3b0-7fa5-49e2-b03b-3ac6ffb99f7c	139aa05f-01db-41b8-b42a-8d368f9cc44c	68e92ebb-6fce-4483-bc9d-cc0ab1d001cb	15.0000	0.00	2026-01-20 04:39:17.413	2026-01-20 04:39:17.413
0229df53-4880-4df9-bbbe-64e41996ea82	139aa05f-01db-41b8-b42a-8d368f9cc44c	15298147-4624-4921-a762-da82ec5e19f1	1.5000	0.00	2026-01-20 04:39:17.413	2026-01-20 04:39:17.413
5d881e77-a66e-46c2-baaf-3e5097bc94ef	139aa05f-01db-41b8-b42a-8d368f9cc44c	30ecde3c-b399-4359-af4f-c98bd11c5db6	1.5000	0.00	2026-01-20 04:39:17.413	2026-01-20 04:39:17.413
5a109c22-732d-4edb-8a93-d821285176ce	139aa05f-01db-41b8-b42a-8d368f9cc44c	db9bac3b-0832-43c3-bfef-123ffe9db980	2.5000	0.00	2026-01-20 04:39:17.413	2026-01-20 04:39:17.413
eb7d2cb2-aaaf-4e83-8909-649d64f67591	139aa05f-01db-41b8-b42a-8d368f9cc44c	4b88c5d3-24ea-45c3-90db-c19715eb600e	0.8000	0.00	2026-01-20 04:39:17.413	2026-01-20 04:39:17.413
fbe091a8-1615-4183-85dd-855ab78ee9f1	139aa05f-01db-41b8-b42a-8d368f9cc44c	16ff1042-ff62-463e-a352-c0dd5cfcdc7c	3.5000	0.00	2026-01-20 04:39:17.413	2026-01-20 04:39:17.413
0453d47e-69dd-4fb9-be3b-e2c0d3540837	d8af28ca-f774-483f-82e9-cc31fd2564b3	56c57505-4059-46cf-9eea-c16dfa8e970c	30.0000	0.00	2026-01-20 04:55:54.926	2026-01-20 04:55:54.926
e0af79f6-9567-46cf-aee7-635b312d84e8	d8af28ca-f774-483f-82e9-cc31fd2564b3	b5b45f5d-55b7-4d8c-a7f7-9794bda116f9	40.0000	0.00	2026-01-20 04:55:54.926	2026-01-20 04:55:54.926
bf5496cb-36a3-4437-a928-9d5a8b24cf93	d8af28ca-f774-483f-82e9-cc31fd2564b3	ba05f26d-9c26-45bf-b6e7-27f2c65a447a	10.0000	0.00	2026-01-20 04:55:54.926	2026-01-20 04:55:54.926
635b8143-ff58-4163-b1ff-7c2733067a15	d8af28ca-f774-483f-82e9-cc31fd2564b3	efb73e36-20cd-456b-8a11-64069c9a6dde	10.0000	0.00	2026-01-20 04:55:54.926	2026-01-20 04:55:54.926
3c9a7119-41b8-483a-be80-421d00bc5bba	d8af28ca-f774-483f-82e9-cc31fd2564b3	15298147-4624-4921-a762-da82ec5e19f1	5.0000	0.00	2026-01-20 04:55:54.926	2026-01-20 04:55:54.926
d3a294ea-80f9-435c-bdee-5701e6e27a0b	6b27dbeb-0963-4741-b97f-03afeed39f2b	1700703a-b14f-4677-b909-e29a1c03ec36	50.0000	0.00	2026-01-20 04:45:16.175	2026-01-20 04:45:16.175
94df63f0-22a5-4613-a150-5e9e2fbc766c	6b27dbeb-0963-4741-b97f-03afeed39f2b	ba05f26d-9c26-45bf-b6e7-27f2c65a447a	15.0000	0.00	2026-01-20 04:45:16.175	2026-01-20 04:45:16.175
0fa24140-f199-4cd6-92cb-ad0ae0aa5d8b	6b27dbeb-0963-4741-b97f-03afeed39f2b	68e92ebb-6fce-4483-bc9d-cc0ab1d001cb	20.0000	0.00	2026-01-20 04:45:16.175	2026-01-20 04:45:16.175
fbb188bc-dcf9-494a-8b39-ac9451617635	6b27dbeb-0963-4741-b97f-03afeed39f2b	30ecde3c-b399-4359-af4f-c98bd11c5db6	5.0000	0.00	2026-01-20 04:45:16.175	2026-01-20 04:45:16.175
47aefe39-8f27-4e8c-8238-1e936ae7828f	6b27dbeb-0963-4741-b97f-03afeed39f2b	15298147-4624-4921-a762-da82ec5e19f1	10.0000	0.00	2026-01-20 04:45:16.175	2026-01-20 04:45:16.175
8010dd64-0bc4-4e1a-9a16-91086a8f2cbd	6b27dbeb-0963-4741-b97f-03afeed39f2b	b1df47f8-bb81-4eef-92b1-257cc70a8c52	0.1200	0.00	2026-01-20 04:45:16.175	2026-01-20 04:45:16.175
415e003c-7f13-4441-92d5-66f99bdb11a9	d8af28ca-f774-483f-82e9-cc31fd2564b3	30ecde3c-b399-4359-af4f-c98bd11c5db6	5.0000	0.00	2026-01-20 04:55:54.926	2026-01-20 04:55:54.926
4f0e1997-51ce-49ec-ba78-5d0e3813e19c	d8af28ca-f774-483f-82e9-cc31fd2564b3	b1df47f8-bb81-4eef-92b1-257cc70a8c52	0.0150	0.00	2026-01-20 04:55:54.926	2026-01-20 04:55:54.926
76fd55c4-072f-48ce-96f9-6f61deff6bbb	c2e09623-337f-4ecc-bc52-02e4ea484050	68e92ebb-6fce-4483-bc9d-cc0ab1d001cb	25.0000	0.00	2026-01-20 06:28:34.507	2026-01-20 06:28:34.507
1a1ef277-f26c-4c22-a990-0fb8bec0f6b1	c2e09623-337f-4ecc-bc52-02e4ea484050	5fc56a9d-a649-4654-be01-40545adb299b	15.0000	0.00	2026-01-20 06:28:34.507	2026-01-20 06:28:34.507
6034faec-a39d-445b-b39a-ce83611c0353	c2e09623-337f-4ecc-bc52-02e4ea484050	dca00a7c-3d85-47ed-8559-da9659a102c1	35.0000	0.00	2026-01-20 06:28:34.507	2026-01-20 06:28:34.507
84062451-2991-48f5-b885-f0e73dd5c5dc	c2e09623-337f-4ecc-bc52-02e4ea484050	db9bac3b-0832-43c3-bfef-123ffe9db980	2.5000	0.00	2026-01-20 06:28:34.507	2026-01-20 06:28:34.507
a45b035c-2137-403d-ac8d-98e72fd11e3e	c2e09623-337f-4ecc-bc52-02e4ea484050	15298147-4624-4921-a762-da82ec5e19f1	1.2500	0.00	2026-01-20 06:28:34.507	2026-01-20 06:28:34.507
63c0b82b-3ea0-463a-9027-8c4c0cfd2cdf	c2e09623-337f-4ecc-bc52-02e4ea484050	30ecde3c-b399-4359-af4f-c98bd11c5db6	1.2500	0.00	2026-01-20 06:28:34.507	2026-01-20 06:28:34.507
c88c8754-698d-40bd-90df-997af552a2db	c2e09623-337f-4ecc-bc52-02e4ea484050	c94295dc-bf84-4f89-9a76-c352b90986ce	20.0000	0.00	2026-01-20 06:28:34.507	2026-01-20 06:28:34.507
8c3ded6f-6336-482d-9be7-b13e9da3be1e	c2e09623-337f-4ecc-bc52-02e4ea484050	16ff1042-ff62-463e-a352-c0dd5cfcdc7c	3.5000	0.00	2026-01-20 06:28:34.507	2026-01-20 06:28:34.507
0389d369-7fe4-48ed-9e58-d3b340654186	c2e09623-337f-4ecc-bc52-02e4ea484050	4b88c5d3-24ea-45c3-90db-c19715eb600e	0.8000	0.00	2026-01-20 06:28:34.507	2026-01-20 06:28:34.507
52d5fabd-3840-4b00-a7aa-30458eaff357	5fbcd7c4-c7b2-4343-8bf0-577a0bade58e	dca00a7c-3d85-47ed-8559-da9659a102c1	80.0000	0.00	2026-01-20 08:08:41.894	2026-01-20 08:08:41.894
7cf08213-51c5-4936-a4ca-04f9d2384bbd	5fbcd7c4-c7b2-4343-8bf0-577a0bade58e	c94295dc-bf84-4f89-9a76-c352b90986ce	10.0000	0.00	2026-01-20 08:08:41.894	2026-01-20 08:08:41.894
fb8219ef-ea20-4801-99f9-bc4a931976dd	5fbcd7c4-c7b2-4343-8bf0-577a0bade58e	30ecde3c-b399-4359-af4f-c98bd11c5db6	2.5000	0.00	2026-01-20 08:08:41.894	2026-01-20 08:08:41.894
fad31fc5-9836-46ed-9996-032ec6a4d0f1	5fbcd7c4-c7b2-4343-8bf0-577a0bade58e	15298147-4624-4921-a762-da82ec5e19f1	2.5000	0.00	2026-01-20 08:08:41.894	2026-01-20 08:08:41.894
de5c87ad-6b3f-4fc7-964d-013469934d2e	5fbcd7c4-c7b2-4343-8bf0-577a0bade58e	db9bac3b-0832-43c3-bfef-123ffe9db980	5.0000	0.00	2026-01-20 08:08:41.894	2026-01-20 08:08:41.894
c25c98f5-aa93-45db-8a63-b0a21e9bc50a	5fbcd7c4-c7b2-4343-8bf0-577a0bade58e	16ff1042-ff62-463e-a352-c0dd5cfcdc7c	2.5000	0.00	2026-01-20 08:08:41.894	2026-01-20 08:08:41.894
5f0e60fd-a46e-47a5-bdd7-31ccbfc689ba	5fbcd7c4-c7b2-4343-8bf0-577a0bade58e	4b88c5d3-24ea-45c3-90db-c19715eb600e	0.8000	0.00	2026-01-20 08:08:41.894	2026-01-20 08:08:41.894
bc6257f3-8e9f-4670-861d-afa79ca4c699	40c18c61-bc88-4b27-938c-c66706203214	56c57505-4059-46cf-9eea-c16dfa8e970c	73.0000	0.00	2026-01-20 08:40:51.742	2026-01-20 08:40:51.742
e9806c86-3db8-4860-8b5a-74329c40ae58	40c18c61-bc88-4b27-938c-c66706203214	15298147-4624-4921-a762-da82ec5e19f1	10.0000	0.00	2026-01-20 08:40:51.742	2026-01-20 08:40:51.742
b5e6844d-d787-4e3d-a8e5-ddfc7727a5cc	40c18c61-bc88-4b27-938c-c66706203214	30ecde3c-b399-4359-af4f-c98bd11c5db6	5.0000	0.00	2026-01-20 08:40:51.742	2026-01-20 08:40:51.742
0a1aa667-02c0-4dad-8e3f-118f06ddbb10	e24a2374-3af7-49ac-b59b-21ce76e8c31e	b5b45f5d-55b7-4d8c-a7f7-9794bda116f9	50.0000	0.00	2026-01-21 01:24:11.923	2026-01-21 01:24:11.923
95f75de7-8565-40d7-b763-4479f8b6c574	e24a2374-3af7-49ac-b59b-21ce76e8c31e	15298147-4624-4921-a762-da82ec5e19f1	5.0000	0.00	2026-01-21 01:24:11.923	2026-01-21 01:24:11.923
e6b8b1f4-e9b6-4d5a-8cf4-3c9d6bf9f669	e24a2374-3af7-49ac-b59b-21ce76e8c31e	30ecde3c-b399-4359-af4f-c98bd11c5db6	5.0000	0.00	2026-01-21 01:24:11.923	2026-01-21 01:24:11.923
80fad0cc-f2ba-49ab-9e02-4d3a510e6c4e	e24a2374-3af7-49ac-b59b-21ce76e8c31e	b1df47f8-bb81-4eef-92b1-257cc70a8c52	0.0100	0.00	2026-01-21 01:24:11.923	2026-01-21 01:24:11.923
0ee7b609-4bfa-4a02-b437-b70d4f9bb142	c95eb05d-8c1d-4319-bb78-47aee39f5464	0635d93b-ffbe-403d-8a05-bb2835cf4d73	549.0000	0.00	2026-01-21 02:54:02.655	2026-01-21 02:54:02.655
\.


--
-- Data for Name: Customer; Type: TABLE DATA; Schema: public; Owner: polyflow
--

COPY public."Customer" (id, name, code, phone, email, "billingAddress", "shippingAddress", "taxId", "creditLimit", "paymentTermDays", "discountPercent", notes, "isActive", "createdAt", "updatedAt") FROM stdin;
91c2fccf-3d1d-48eb-bd0e-418a49ad0d8d	Default Customer	CUST-DEFAULT	0000000000	\N	—	\N	\N	\N	\N	\N	\N	t	2026-01-17 13:23:07.18	2026-01-17 13:23:07.18
\.


--
-- Data for Name: Employee; Type: TABLE DATA; Schema: public; Owner: polyflow
--

COPY public."Employee" (id, name, code, role, status, "createdAt", "updatedAt") FROM stdin;
0f8071e6-ac69-4127-85af-711b93963f26	MULARNO	EMP-001	OPERATOR	ACTIVE	2026-01-20 04:08:08.767	2026-01-20 04:08:08.767
ef4c8de8-b54b-45fd-8b1e-3a051b9b06f5	PRIMA	EMP-002	OPERATOR	ACTIVE	2026-01-20 04:08:17.87	2026-01-20 04:08:17.87
bfd02ba3-61cd-4d10-86b2-576b57e3dc8a	PURWANTI	EMP-003	OPERATOR	ACTIVE	2026-01-20 04:08:41.281	2026-01-20 04:08:41.281
2afd2c00-ec79-4066-8ccd-aaff961caf8f	IDRIS	EMP-004	OPERATOR	ACTIVE	2026-01-20 04:08:51.452	2026-01-20 04:08:51.452
87f04a68-5439-4bec-8d34-65a33e032728	Sumarsih	EMP-005	PACKER	ACTIVE	2026-01-20 06:32:45.095	2026-01-20 06:32:45.095
1321868c-14a8-4d9a-b360-0c01ac1dff6b	Ambarwati	EMP-006	PACKER	ACTIVE	2026-01-20 06:32:54.265	2026-01-20 06:32:54.265
8efe8a06-f131-43ac-8df3-6b586837ac05	Abrar 	EMP-007	HELPER	ACTIVE	2026-01-20 06:33:07.507	2026-01-20 06:33:07.507
2fd25abe-01ae-47f7-aaa5-c7c2989a27b9	Wahyu	EMP-008	HELPER	ACTIVE	2026-01-20 06:33:14.865	2026-01-20 06:33:14.865
e87274eb-adfe-46fd-81d7-628999cef8bc	Wagino	EMP-009	OPERATOR	ACTIVE	2026-01-21 02:42:18.66	2026-01-21 02:42:18.66
62faf4bd-1772-45ca-94af-303b7f486542	Gatot	EMP-010	HELPER	ACTIVE	2026-01-21 02:42:29.349	2026-01-21 02:43:16.151
\.


--
-- Data for Name: GoodsReceipt; Type: TABLE DATA; Schema: public; Owner: polyflow
--

COPY public."GoodsReceipt" (id, "receiptNumber", "purchaseOrderId", "receivedDate", "locationId", notes, "createdById", "createdAt") FROM stdin;
492e9f1b-c4d1-4407-b3ef-d3ce9e28b534	GR-2026-0001	23fd708f-f39e-4db6-9b63-45a116b06a66	2026-01-21 01:45:12.618	75ad437b-9b34-41e1-b427-7cb63e236247	Receipt for order PO-2026-0001	a8971ec0-a686-43b0-aec0-53d383321331	2026-01-21 01:45:18.568
0200ae89-00fa-4631-94f9-1cf36829b012	GR-2026-0002	92399630-81ec-4ef5-ada1-32b0c7ff3e11	2026-01-21 02:19:00.588	75ad437b-9b34-41e1-b427-7cb63e236247	Receipt for order PO-2026-0002	f0000eff-2dfa-4cad-8669-0243b1f9f51e	2026-01-21 02:19:14.479
\.


--
-- Data for Name: GoodsReceiptItem; Type: TABLE DATA; Schema: public; Owner: polyflow
--

COPY public."GoodsReceiptItem" (id, "goodsReceiptId", "productVariantId", "receivedQty", "unitCost") FROM stdin;
2877f69f-1897-4e6d-8aa5-b842d5a71a6e	492e9f1b-c4d1-4407-b3ef-d3ce9e28b534	68e92ebb-6fce-4483-bc9d-cc0ab1d001cb	375.0000	12000.0000
ac908ad4-4ab3-4094-a5b6-8a19b4fe7d75	0200ae89-00fa-4631-94f9-1cf36829b012	dca00a7c-3d85-47ed-8559-da9659a102c1	650.0000	10000.0000
\.


--
-- Data for Name: Inventory; Type: TABLE DATA; Schema: public; Owner: polyflow
--

COPY public."Inventory" (id, "locationId", "productVariantId", quantity, "updatedAt", "averageCost") FROM stdin;
bb17247d-88c3-4d97-86d0-4232e99df21e	0452f60e-9518-4a8b-ad5b-5e6d46297c4a	c325b4c0-73d7-4aff-b9bf-52d72bbda84c	562.0000	2026-01-19 07:16:26.297	\N
10bdb020-2a64-4c14-85e4-ab2b20d3223c	75ad437b-9b34-41e1-b427-7cb63e236247	b1df47f8-bb81-4eef-92b1-257cc70a8c52	100.0000	2026-01-19 06:29:13.496	\N
0e536dc0-16d8-4d94-bf77-1697b3abcfa0	75ad437b-9b34-41e1-b427-7cb63e236247	b5b45f5d-55b7-4d8c-a7f7-9794bda116f9	9.0000	2026-01-19 06:32:34.923	\N
d88680a2-31f7-4728-b10e-15ac785ba4db	75ad437b-9b34-41e1-b427-7cb63e236247	c25c2770-ec37-4d87-a1d3-bf38e0117992	25.0000	2026-01-19 07:03:26.559	\N
e816e597-6ff6-42ab-b0e1-19c9cdce1b63	75ad437b-9b34-41e1-b427-7cb63e236247	03178aa0-cda1-484c-b85c-60eb6386c606	0.0000	2026-01-19 07:07:21.512	\N
0326ffb3-3a66-4eaf-be87-3d694e8dc6ad	0c882912-ebec-44e4-8431-bae328a11436	0635d93b-ffbe-403d-8a05-bb2835cf4d73	549.0000	2026-01-21 02:49:40.536	\N
c31637cd-9545-437c-b715-afecc72b8d9e	75ad437b-9b34-41e1-b427-7cb63e236247	e9c1e73b-4fe5-4037-9385-20bab938b240	950.0000	2026-01-19 07:08:06.724	\N
019e8d11-e529-40d1-a1c9-050dcdcf2472	75ad437b-9b34-41e1-b427-7cb63e236247	05f32ad0-c46a-4f7e-9e1e-ad3a0967b878	14.0000	2026-01-19 07:08:55.535	\N
738caf4c-e663-4491-b765-a31402964b6a	75ad437b-9b34-41e1-b427-7cb63e236247	0e5d730f-9d6c-4445-b20d-b3901f8c9205	456.0000	2026-01-19 07:09:33.35	\N
33b8e852-1056-4675-beab-5731de26b912	75ad437b-9b34-41e1-b427-7cb63e236247	e4d7b713-2714-4555-8378-47741a4951af	275.0000	2026-01-19 07:10:05.322	\N
64d91e98-fff9-45d5-8470-3055db9e172c	75ad437b-9b34-41e1-b427-7cb63e236247	56c57505-4059-46cf-9eea-c16dfa8e970c	5.0000	2026-01-19 06:39:44.288	\N
f1fc9aab-8a52-4cc0-a44f-52761ce34a07	75ad437b-9b34-41e1-b427-7cb63e236247	5e18ea2a-2800-489c-a423-249d8074f019	64.0000	2026-01-19 06:40:13.197	\N
e3ba2623-521a-4c63-adb3-850dac3481a9	75ad437b-9b34-41e1-b427-7cb63e236247	efb73e36-20cd-456b-8a11-64069c9a6dde	500.0000	2026-01-19 06:40:31.203	\N
22adaa18-548f-416b-9b95-47e533ef39cf	75ad437b-9b34-41e1-b427-7cb63e236247	ba05f26d-9c26-45bf-b6e7-27f2c65a447a	395.0000	2026-01-19 06:41:30.907	\N
59fbfcf1-9414-46bb-9050-85aff072184c	75ad437b-9b34-41e1-b427-7cb63e236247	1700703a-b14f-4677-b909-e29a1c03ec36	296.0000	2026-01-19 06:41:48.721	\N
be5cd0df-f518-450c-bf77-a645a99aceb2	75ad437b-9b34-41e1-b427-7cb63e236247	7a5251cc-18d8-4f78-833c-afd4fdc8c9b5	125.0000	2026-01-19 07:10:35.683	\N
6f31c7b9-42a1-47ac-a7ce-1eca446a9e3a	75ad437b-9b34-41e1-b427-7cb63e236247	534c06cf-cf1f-4014-bdfc-e99820d04469	175.0000	2026-01-19 07:11:03.355	\N
f09119d3-4c6b-442d-bc26-137828b22a69	75ad437b-9b34-41e1-b427-7cb63e236247	5f44845e-fbae-4fd8-8338-5b6cad10fbd1	175.0000	2026-01-19 07:11:26.359	\N
792ca2e9-a939-44ca-b3a7-a701f9ea1451	75ad437b-9b34-41e1-b427-7cb63e236247	94fff4c0-f8c1-4451-933c-8e6a19efc41d	350.0000	2026-01-19 07:12:16.959	\N
5ee99956-f37d-4cfd-9809-b40770e31166	75ad437b-9b34-41e1-b427-7cb63e236247	f7eb4c8c-6e14-4709-9590-1bebf0633feb	0.0000	2026-01-19 07:12:41.038	\N
30286661-7b5b-418f-88b5-87b6af61fc4b	0452f60e-9518-4a8b-ad5b-5e6d46297c4a	65baaa0c-defe-4c8d-87bf-9b2ab2a0874a	110.0000	2026-01-19 07:14:23.931	\N
bee5d29b-2e6d-4ed6-b768-516732b79e2a	0452f60e-9518-4a8b-ad5b-5e6d46297c4a	ce7f996e-3a3b-4d93-bbb1-52c818f9e779	339.0000	2026-01-19 07:15:01.325	\N
46760455-c78d-495e-84f8-cb8e8966a98e	0452f60e-9518-4a8b-ad5b-5e6d46297c4a	9dda0cd7-31bb-469e-8891-fe88c5e01d33	561.0000	2026-01-19 07:15:28.873	\N
fffe33ff-8e5f-4e85-8720-cc30cb6c73c4	75ad437b-9b34-41e1-b427-7cb63e236247	68e92ebb-6fce-4483-bc9d-cc0ab1d001cb	2170.0000	2026-01-21 03:45:30.972	640660.5923
74dd5e10-57cc-418e-abb6-264990598980	0452f60e-9518-4a8b-ad5b-5e6d46297c4a	67afcf50-f8a2-4dea-ad11-733acc19682f	1155.0000	2026-01-19 08:46:41.616	\N
c93784bb-a0a9-4dc0-835d-5224e0a40263	0452f60e-9518-4a8b-ad5b-5e6d46297c4a	0fc1f30b-43d3-4f84-8876-5402bc8c5e65	588.0000	2026-01-19 08:48:14.151	\N
5783ad86-d65f-4842-a488-2b8905515b15	0452f60e-9518-4a8b-ad5b-5e6d46297c4a	0da6d9f3-6a7c-492f-a204-d82b86a36b5f	381.0000	2026-01-19 08:48:34.587	\N
058ada60-4684-44ae-a1c0-d91538ab6ed4	0452f60e-9518-4a8b-ad5b-5e6d46297c4a	53d5fd3f-f333-4961-b244-6d7220b29d1d	479.0000	2026-01-19 08:48:55.136	\N
b278caf1-e785-451e-bea5-ee41cd53421c	0452f60e-9518-4a8b-ad5b-5e6d46297c4a	b903b729-2e91-44ee-b83c-b3c5554e49a0	166.0000	2026-01-19 08:49:25.83	\N
e3b67d6d-b358-4668-b23a-2e62977fbe08	0452f60e-9518-4a8b-ad5b-5e6d46297c4a	dd7a7330-3851-4747-bdec-46d339148e9f	324.0000	2026-01-19 08:49:55.456	\N
32d77e64-0280-4ac0-8709-44142a711110	0452f60e-9518-4a8b-ad5b-5e6d46297c4a	41c20290-7fe7-46da-afb9-8bfe11077d05	543.0000	2026-01-19 08:50:23.909	\N
6e51654e-0651-4cf5-988f-e9171c123b60	0452f60e-9518-4a8b-ad5b-5e6d46297c4a	c07a7d2d-a068-4f33-adac-00af64ce08d3	54.0000	2026-01-19 08:51:10.588	\N
a2d6ff8f-b0df-4af9-8794-3716d26ad7b9	0452f60e-9518-4a8b-ad5b-5e6d46297c4a	510fe8a8-1a9f-4439-bdd2-7ed9a4dddd1a	57.0000	2026-01-19 08:52:26.738	\N
0735350c-2564-4fc2-b833-84a751df9f83	0452f60e-9518-4a8b-ad5b-5e6d46297c4a	48c41b36-7cad-49d6-9f2c-94e7bce32725	60.0000	2026-01-19 08:52:49.455	\N
6aa2c5a8-294a-4164-9246-c5ab7f1aecc6	0452f60e-9518-4a8b-ad5b-5e6d46297c4a	c35a2345-0a2c-471f-a6e8-32e0589c1576	43.0000	2026-01-19 08:53:31.543	\N
55c534e0-7831-49b2-8417-1396c3d15c2c	0452f60e-9518-4a8b-ad5b-5e6d46297c4a	e61096c6-92b5-4b46-b828-3a2a25bf6fb6	220.0000	2026-01-19 08:53:59.442	\N
b3195f5d-08d4-4571-9406-843cff388b45	0452f60e-9518-4a8b-ad5b-5e6d46297c4a	979d2b8f-b2c6-4a97-b578-ac58daa29d36	303.0000	2026-01-19 08:56:37.485	\N
5455fdfd-75d7-4227-892f-974544aa9f9c	0c882912-ebec-44e4-8431-bae328a11436	5fc56a9d-a649-4654-be01-40545adb299b	-250.0000	2026-01-21 02:49:40.549	\N
6aeb6dd4-0d64-4dc1-b42d-54be899a4429	0c882912-ebec-44e4-8431-bae328a11436	c94295dc-bf84-4f89-9a76-c352b90986ce	-100.0000	2026-01-21 02:49:40.559	\N
0137d930-8df4-4ae9-8b3b-aa0883b9cf60	0c882912-ebec-44e4-8431-bae328a11436	94fff4c0-f8c1-4451-933c-8e6a19efc41d	-25.0000	2026-01-21 02:49:40.567	\N
31f4be82-a348-41cc-8e93-35314e0a3d52	75ad437b-9b34-41e1-b427-7cb63e236247	5fc56a9d-a649-4654-be01-40545adb299b	1867.0000	2026-01-21 03:45:30.999	\N
0ebed52d-0a19-4e94-9812-d72b041dbc5f	75ad437b-9b34-41e1-b427-7cb63e236247	dca00a7c-3d85-47ed-8559-da9659a102c1	539.0000	2026-01-21 03:45:31.011	\N
57288891-88b2-4647-a091-a3542b66f1cc	0c882912-ebec-44e4-8431-bae328a11436	dca00a7c-3d85-47ed-8559-da9659a102c1	-50.0000	2026-01-21 02:49:40.575	\N
77196fe2-76c5-4b57-98d1-d074fd9a88dd	0c882912-ebec-44e4-8431-bae328a11436	68e92ebb-6fce-4483-bc9d-cc0ab1d001cb	-75.0000	2026-01-21 02:49:40.583	\N
cbd285d2-e37b-4067-8b2b-6fb0ac202fd9	0c882912-ebec-44e4-8431-bae328a11436	15298147-4624-4921-a762-da82ec5e19f1	-7.5000	2026-01-21 02:49:40.59	\N
f83c5f0f-3d82-4c60-918c-a1a20d8fd990	0c882912-ebec-44e4-8431-bae328a11436	30ecde3c-b399-4359-af4f-c98bd11c5db6	-7.5000	2026-01-21 02:49:40.598	\N
e2504d00-261f-41d7-9408-44b6c77c3f21	0c882912-ebec-44e4-8431-bae328a11436	db9bac3b-0832-43c3-bfef-123ffe9db980	-12.5000	2026-01-21 02:49:40.603	\N
52c2ba36-2803-4ad9-8830-d02fc6d47987	0c882912-ebec-44e4-8431-bae328a11436	4b88c5d3-24ea-45c3-90db-c19715eb600e	-4.0000	2026-01-21 02:49:40.611	\N
f48657b3-21d6-462b-b0cc-460ad93d7276	0c882912-ebec-44e4-8431-bae328a11436	16ff1042-ff62-463e-a352-c0dd5cfcdc7c	-17.5000	2026-01-21 02:49:40.618	\N
a0dc3bf5-fcbe-488b-a203-a599a0125f60	0452f60e-9518-4a8b-ad5b-5e6d46297c4a	0c41e285-16e5-4ba1-b688-8cde225e9d21	108.0000	2026-01-21 03:03:32.9	\N
e89e1332-56a9-4c80-adf0-062807e66933	0452f60e-9518-4a8b-ad5b-5e6d46297c4a	e5c741e6-7652-4e66-92c1-c80587df7b86	150.0000	2026-01-21 03:03:32.919	\N
731df667-cbc7-40f6-a6cc-847716aaf222	0452f60e-9518-4a8b-ad5b-5e6d46297c4a	976d3eba-a011-4d35-9773-d5b4dd613551	25.0000	2026-01-21 03:03:32.931	\N
86806cea-4d81-4926-8c35-eea6e52e2023	75ad437b-9b34-41e1-b427-7cb63e236247	db9bac3b-0832-43c3-bfef-123ffe9db980	816.5000	2026-01-21 03:45:31.021	\N
092b954a-1804-4cf1-888a-3f6117359163	75ad437b-9b34-41e1-b427-7cb63e236247	15298147-4624-4921-a762-da82ec5e19f1	273.7500	2026-01-21 03:45:31.031	\N
0d121031-4d1f-4131-8c63-f731e848b5db	75ad437b-9b34-41e1-b427-7cb63e236247	30ecde3c-b399-4359-af4f-c98bd11c5db6	1368.7500	2026-01-21 03:45:31.043	\N
29412282-7f4c-4603-aea3-552a044ea2bb	75ad437b-9b34-41e1-b427-7cb63e236247	c94295dc-bf84-4f89-9a76-c352b90986ce	880.0000	2026-01-21 03:45:31.054	\N
2006f4a1-a001-44ca-b888-86bb94b2bb71	75ad437b-9b34-41e1-b427-7cb63e236247	16ff1042-ff62-463e-a352-c0dd5cfcdc7c	96.5000	2026-01-21 03:45:31.065	\N
e2b642c3-8ff5-4e8f-be1c-302bf4a714af	75ad437b-9b34-41e1-b427-7cb63e236247	4b88c5d3-24ea-45c3-90db-c19715eb600e	29.2000	2026-01-21 03:45:31.079	\N
\.


--
-- Data for Name: Invoice; Type: TABLE DATA; Schema: public; Owner: polyflow
--

COPY public."Invoice" (id, "invoiceNumber", "salesOrderId", "invoiceDate", "dueDate", status, "totalAmount", "paidAmount", notes, "createdAt", "updatedAt") FROM stdin;
2117d921-434a-4afb-a7b0-73b403c7984c	INV-20260121-0001	07ebed5c-9874-4766-b6e9-0db5440e4dd1	2026-01-21 03:03:47.633	\N	UNPAID	16875000.00	0.00	Invoice for Order SO-2026-0001	2026-01-21 03:03:48.326	2026-01-21 03:03:48.326
\.


--
-- Data for Name: JobRole; Type: TABLE DATA; Schema: public; Owner: polyflow
--

COPY public."JobRole" (id, name, "createdAt", "updatedAt") FROM stdin;
727d6206-6adb-4fd9-ad8d-961f7efe02f8	OPERATOR	2026-01-20 04:07:39.456	2026-01-20 04:07:39.456
018ac6c5-3026-43f6-b084-28ff657ed5bf	HELPER	2026-01-20 04:07:39.456	2026-01-20 04:07:39.456
b35567ec-011b-47bb-b0e9-078cd7581061	PACKER	2026-01-20 04:07:39.456	2026-01-20 04:07:39.456
d71ef100-3fe1-4e29-be11-6952715c0b3c	MANAGER	2026-01-20 04:07:39.456	2026-01-20 04:07:39.456
\.


--
-- Data for Name: Location; Type: TABLE DATA; Schema: public; Owner: polyflow
--

COPY public."Location" (id, name, slug, description, "createdAt", "updatedAt") FROM stdin;
75ad437b-9b34-41e1-b427-7cb63e236247	Raw Material Warehouse	rm_warehouse	Storage for incoming raw materials	2026-01-17 13:23:07.158	2026-01-17 13:23:07.158
0c882912-ebec-44e4-8431-bae328a11436	Mixing Warehouse	mixing_warehouse	Storage for the output of the Mixing process	2026-01-17 13:23:07.158	2026-01-17 13:23:07.158
0452f60e-9518-4a8b-ad5b-5e6d46297c4a	Finished Goods Warehouse	fg_warehouse	Storage for finished goods	2026-01-17 13:23:07.158	2026-01-17 13:23:07.158
2e4f8f8c-b1bf-49f4-9c88-93d48942c184	Scrap Warehouse	scrap_warehouse	Storage for waste/afval	2026-01-17 13:23:07.158	2026-01-17 13:23:07.158
\.


--
-- Data for Name: Machine; Type: TABLE DATA; Schema: public; Owner: polyflow
--

COPY public."Machine" (id, name, code, type, "locationId", status, "createdAt", "updatedAt") FROM stdin;
7533b3c2-fcfd-4470-aa8d-74a9c050d5db	MIXER HD	MIX-01	MIXER	0452f60e-9518-4a8b-ad5b-5e6d46297c4a	ACTIVE	2026-01-20 03:13:44.683	2026-01-20 03:15:47.825
57571781-0a8e-41ee-be60-a44de10e05ef	EKSTRUDER	EKS-01	EXTRUDER	0452f60e-9518-4a8b-ad5b-5e6d46297c4a	ACTIVE	2026-01-20 03:14:12.631	2026-01-20 03:16:22.224
4f9ac60c-5fee-479b-a2e6-55cb7365a732	HYDRAULIC POND	POND-01	PACKER	0452f60e-9518-4a8b-ad5b-5e6d46297c4a	ACTIVE	2026-01-20 03:17:51.116	2026-01-20 03:17:51.116
06b4a198-b488-4018-9290-aa42c45dadfc	CUTTING 	CUT-01	PACKER	0452f60e-9518-4a8b-ad5b-5e6d46297c4a	ACTIVE	2026-01-20 03:18:52.049	2026-01-20 03:18:52.049
\.


--
-- Data for Name: MachineDowntime; Type: TABLE DATA; Schema: public; Owner: polyflow
--

COPY public."MachineDowntime" (id, "machineId", reason, "startTime", "endTime", "createdById", "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: MaterialIssue; Type: TABLE DATA; Schema: public; Owner: polyflow
--

COPY public."MaterialIssue" (id, "productionOrderId", "productVariantId", quantity, "issuedAt", "createdById", "batchId") FROM stdin;
b64b2952-202e-48e4-b81a-d966be359ee4	3787262c-22e2-4efa-90de-e2ce55f355f7	68e92ebb-6fce-4483-bc9d-cc0ab1d001cb	25.0000	2026-01-21 03:45:30.98	\N	\N
494a8849-9eb8-409a-880d-0ef4d00db3e8	3787262c-22e2-4efa-90de-e2ce55f355f7	5fc56a9d-a649-4654-be01-40545adb299b	15.0000	2026-01-21 03:45:31.002	\N	\N
6f3bf71b-ceab-479c-b8de-ccfbcf4d43d2	3787262c-22e2-4efa-90de-e2ce55f355f7	dca00a7c-3d85-47ed-8559-da9659a102c1	35.0000	2026-01-21 03:45:31.013	\N	\N
49dd2bf6-8b60-4fe4-99c3-682f4a2c02c3	3787262c-22e2-4efa-90de-e2ce55f355f7	db9bac3b-0832-43c3-bfef-123ffe9db980	2.5000	2026-01-21 03:45:31.024	\N	\N
a8e423d2-1b6c-4eda-ab80-a8eb12dc72e0	3787262c-22e2-4efa-90de-e2ce55f355f7	15298147-4624-4921-a762-da82ec5e19f1	1.2500	2026-01-21 03:45:31.034	\N	\N
d8ee4b3b-f934-415f-8331-aa649904ce97	3787262c-22e2-4efa-90de-e2ce55f355f7	30ecde3c-b399-4359-af4f-c98bd11c5db6	1.2500	2026-01-21 03:45:31.046	\N	\N
4463ead2-5d29-4bef-bfb2-9252f4fdae8c	3787262c-22e2-4efa-90de-e2ce55f355f7	c94295dc-bf84-4f89-9a76-c352b90986ce	20.0000	2026-01-21 03:45:31.056	\N	\N
2144540f-637c-460f-b017-74972a2be4d3	3787262c-22e2-4efa-90de-e2ce55f355f7	16ff1042-ff62-463e-a352-c0dd5cfcdc7c	3.5000	2026-01-21 03:45:31.069	\N	\N
41259c39-ef2c-48bd-80cd-e2289db74891	3787262c-22e2-4efa-90de-e2ce55f355f7	4b88c5d3-24ea-45c3-90db-c19715eb600e	0.8000	2026-01-21 03:45:31.083	\N	\N
\.


--
-- Data for Name: Product; Type: TABLE DATA; Schema: public; Owner: polyflow
--

COPY public."Product" (id, name, "productType", "createdAt", "updatedAt") FROM stdin;
a17863a7-f0f6-4e7c-bcbc-e3b56ab6cfd9	Scrap Example	SCRAP	2026-01-17 13:23:07.228	2026-01-17 13:23:07.228
b36c98e1-8e27-476f-a19d-5c6a3c57b495	HD TRANS	RAW_MATERIAL	2026-01-19 02:41:56.71	2026-01-19 02:41:56.71
10ae5781-d579-4208-9b44-6e4fe9d9d8f1	HDP	RAW_MATERIAL	2026-01-19 02:41:56.722	2026-01-19 02:41:56.722
96210a57-e35f-49d9-a8c8-126db9367f17	HD 1	RAW_MATERIAL	2026-01-19 02:41:56.73	2026-01-19 02:41:56.73
7180eeb6-21a7-4776-a307-e4f927fd3d08	HD PK PUTIH	RAW_MATERIAL	2026-01-19 02:41:56.738	2026-01-19 02:41:56.738
f6559495-fa05-43ce-a788-461b80696b78	KALSIUM	RAW_MATERIAL	2026-01-19 02:41:56.746	2026-01-19 02:41:56.746
5ea81616-da84-4c84-8af2-d61c2a97db3d	BARIUM	RAW_MATERIAL	2026-01-19 02:41:56.759	2026-01-19 02:41:56.759
24c5107f-0962-4355-a779-9819874079ea	HD ORI	RAW_MATERIAL	2026-01-19 02:41:56.767	2026-01-19 02:41:56.767
df96ba7a-cb95-4ec6-bf23-9f3f4666a11c	PE	RAW_MATERIAL	2026-01-19 02:41:56.776	2026-01-19 02:41:56.776
0384b223-34fe-4887-868f-48802bc2e498	HD WARNA	RAW_MATERIAL	2026-01-19 02:41:56.797	2026-01-19 02:41:56.797
6f4c43fd-01f7-4176-bb3e-8b4ba93a46c5	Pelembab	RAW_MATERIAL	2026-01-19 02:41:56.864	2026-01-19 02:41:56.864
79e4d827-4ef4-4756-87f1-5ccbb556a9f1	Bright	RAW_MATERIAL	2026-01-19 02:41:56.871	2026-01-19 02:41:56.871
0383ae6d-d1d0-4d03-bf60-f25da5fbe61f	HMP	FINISHED_GOOD	2026-01-19 02:41:56.876	2026-01-19 02:41:56.876
3412ec72-1893-416d-a251-7bbea1fcc92f	HUR	FINISHED_GOOD	2026-01-19 02:41:56.927	2026-01-19 02:41:56.927
27fdcf72-b73d-47c8-b99c-06dc797573d0	HPR	FINISHED_GOOD	2026-01-19 02:41:56.944	2026-01-19 02:41:56.944
a9bee487-2f4a-4588-99f4-11d92bbbb592	PG OZ	FINISHED_GOOD	2026-01-19 02:41:56.951	2026-01-19 02:41:56.951
1e9226de-3988-4936-8c3d-a73c1f6aa45a	HD JUMBO	FINISHED_GOOD	2026-01-19 02:41:56.959	2026-01-19 02:41:56.959
75f416cf-483b-4711-8297-3d54fbe0bb3d	Mix - HD Ungu Reguler	INTERMEDIATE	2026-01-19 03:01:59.554	2026-01-20 04:41:55.361
a7916cad-e8d3-43b8-8f51-099acd7a7681	Mix - MP Trans	INTERMEDIATE	2026-01-20 04:27:53.141	2026-01-20 04:42:16.819
01dda341-50bb-47c3-b840-e937ef12af66	Mix - AgungTex	INTERMEDIATE	2026-01-20 04:30:43.077	2026-01-20 04:42:51.308
54d59e4a-d6e5-411e-b8c0-5bda5edcf692	Mix - MP Trans ORI	INTERMEDIATE	2026-01-20 04:28:52.852	2026-01-20 04:43:11.728
369c44b8-d894-405c-860b-4b8fc8233901	Mix - HD Jumbo	INTERMEDIATE	2026-01-20 08:30:45.295	2026-01-20 08:34:17.841
905eb466-fe9d-4c06-a07b-b5948b6da037	MASTERBATCH	RAW_MATERIAL	2026-01-19 02:41:56.85	2026-01-20 08:58:29.166
b62cc37c-d67a-4fe6-ad7e-ef24cbac8591	Mix - PG OZ	INTERMEDIATE	2026-01-21 01:22:09.884	2026-01-21 01:22:09.884
\.


--
-- Data for Name: ProductVariant; Type: TABLE DATA; Schema: public; Owner: polyflow
--

COPY public."ProductVariant" (id, "productId", name, "skuCode", price, "buyPrice", "sellPrice", "primaryUnit", "salesUnit", "conversionFactor", attributes, "createdAt", "updatedAt", "minStockAlert", "leadTimeDays", "preferredSupplierId", "reorderPoint", "reorderQuantity", "costingMethod", "standardCost") FROM stdin;
1cf39364-e42c-41af-94e7-d764c3747b26	a17863a7-f0f6-4e7c-bcbc-e3b56ab6cfd9	Scrap Example	SCRAP-EXAMPLE	\N	\N	\N	KG	KG	1.0000	{"note": "Baseline seed example"}	2026-01-17 13:23:07.228	2026-01-17 13:23:07.228	\N	\N	\N	\N	\N	WEIGHTED_AVERAGE	\N
b5b45f5d-55b7-4d8c-a7f7-9794bda116f9	b36c98e1-8e27-476f-a19d-5c6a3c57b495	HD TRANS	RMHDT001	14000.00	14000.00	\N	KG	BAL	25.0000	{"color": "Clear", "material": "Resin"}	2026-01-19 02:41:56.713	2026-01-19 02:41:56.713	100.0000	\N	\N	\N	\N	WEIGHTED_AVERAGE	\N
56c57505-4059-46cf-9eea-c16dfa8e970c	10ae5781-d579-4208-9b44-6e4fe9d9d8f1	HDP	RMHDP001	11750.00	11750.00	\N	KG	BAL	25.0000	{"color": "Grey", "material": "Resin"}	2026-01-19 02:41:56.725	2026-01-19 02:41:56.725	100.0000	\N	\N	\N	\N	WEIGHTED_AVERAGE	\N
5fc56a9d-a649-4654-be01-40545adb299b	96210a57-e35f-49d9-a8c8-126db9367f17	HD 1	RMHDP002	12000.00	12000.00	\N	KG	BAL	25.0000	{"color": "Dark Grey", "material": "Resin"}	2026-01-19 02:41:56.733	2026-01-19 02:41:56.733	100.0000	\N	\N	\N	\N	WEIGHTED_AVERAGE	\N
5e18ea2a-2800-489c-a423-249d8074f019	7180eeb6-21a7-4776-a307-e4f927fd3d08	HD PK PUTIH	RMHPK001	13000.00	13000.00	\N	KG	BAL	25.0000	{"color": "White", "material": "Resin"}	2026-01-19 02:41:56.742	2026-01-19 02:41:56.742	100.0000	\N	\N	\N	\N	WEIGHTED_AVERAGE	\N
efb73e36-20cd-456b-8a11-64069c9a6dde	f6559495-fa05-43ce-a788-461b80696b78	NV 2	RMCNV002	7400.00	7400.00	\N	KG	BAL	25.0000	{"color": "White", "material": "Filler"}	2026-01-19 02:41:56.75	2026-01-19 02:41:56.75	100.0000	\N	\N	\N	\N	WEIGHTED_AVERAGE	\N
c94295dc-bf84-4f89-9a76-c352b90986ce	f6559495-fa05-43ce-a788-461b80696b78	APE 88	RMCAP001	5700.00	5700.00	\N	KG	BAL	25.0000	{"color": "White", "material": "FIller"}	2026-01-19 02:41:56.754	2026-01-19 02:41:56.754	100.0000	\N	\N	\N	\N	WEIGHTED_AVERAGE	\N
ba05f26d-9c26-45bf-b6e7-27f2c65a447a	5ea81616-da84-4c84-8af2-d61c2a97db3d	BARIUM	RMBRM001	17205.00	17205.00	\N	KG	BAL	25.0000	{"color": "White", "material": "Filler"}	2026-01-19 02:41:56.762	2026-01-19 02:41:56.762	100.0000	\N	\N	\N	\N	WEIGHTED_AVERAGE	\N
1700703a-b14f-4677-b909-e29a1c03ec36	24c5107f-0962-4355-a779-9819874079ea	HD ORI	RMHDO001	18426.00	18426.00	\N	KG	BAL	25.0000	{"color": "Clear White", "material": "Resin"}	2026-01-19 02:41:56.77	2026-01-19 02:41:56.77	100.0000	\N	\N	\N	\N	WEIGHTED_AVERAGE	\N
30ecde3c-b399-4359-af4f-c98bd11c5db6	df96ba7a-cb95-4ec6-bf23-9f3f4666a11c	LDPE	RMLDP001	13800.00	13800.00	\N	KG	BAL	25.0000	{"color": "White", "material": "Resin"}	2026-01-19 02:41:56.78	2026-01-19 02:41:56.78	100.0000	\N	\N	\N	\N	WEIGHTED_AVERAGE	\N
db9bac3b-0832-43c3-bfef-123ffe9db980	df96ba7a-cb95-4ec6-bf23-9f3f4666a11c	MANGKAK	RMPMK001	12000.00	12000.00	\N	KG	BAL	25.0000	{"color": "Brown", "material": "Resin"}	2026-01-19 02:41:56.785	2026-01-19 02:41:56.785	100.0000	\N	\N	\N	\N	WEIGHTED_AVERAGE	\N
15298147-4624-4921-a762-da82ec5e19f1	df96ba7a-cb95-4ec6-bf23-9f3f4666a11c	CSPE	RMCSP001	18204.00	18204.00	\N	KG	BAL	25.0000	{"color": "White", "material": "Resin"}	2026-01-19 02:41:56.788	2026-01-19 02:41:56.788	100.0000	\N	\N	\N	\N	WEIGHTED_AVERAGE	\N
c25c2770-ec37-4d87-a1d3-bf38e0117992	df96ba7a-cb95-4ec6-bf23-9f3f4666a11c	PETLIN	RMPTL001	28860.00	28860.00	\N	KG	BAL	25.0000	{"color": "Clear White", "material": "Resin"}	2026-01-19 02:41:56.793	2026-01-19 02:41:56.793	100.0000	\N	\N	\N	\N	WEIGHTED_AVERAGE	\N
03178aa0-cda1-484c-b85c-60eb6386c606	0384b223-34fe-4887-868f-48802bc2e498	HD Ungu 	RMHDU002	10000.00	10000.00	\N	KG	BAL	25.0000	{"color": "Purple", "material": "Resin"}	2026-01-19 02:41:56.807	2026-01-19 02:41:56.807	100.0000	\N	\N	\N	\N	WEIGHTED_AVERAGE	\N
e9c1e73b-4fe5-4037-9385-20bab938b240	0384b223-34fe-4887-868f-48802bc2e498	HDP Merah 	RMHDM001	10000.00	10000.00	\N	KG	BAL	25.0000	{"color": "Red", "material": "Resin"}	2026-01-19 02:41:56.812	2026-01-19 02:41:56.812	100.0000	\N	\N	\N	\N	WEIGHTED_AVERAGE	\N
05f32ad0-c46a-4f7e-9e1e-ad3a0967b878	0384b223-34fe-4887-868f-48802bc2e498	HD Merah 	RMHDM002	9000.00	9000.00	\N	KG	BAL	25.0000	{"color": "Red", "material": "Resin"}	2026-01-19 02:41:56.818	2026-01-19 02:41:56.818	100.0000	\N	\N	\N	\N	WEIGHTED_AVERAGE	\N
e4d7b713-2714-4555-8378-47741a4951af	0384b223-34fe-4887-868f-48802bc2e498	HD Hijau 	RMHDH002	9000.00	9000.00	\N	KG	BAL	25.0000	{"color": "Green", "material": "Resin"}	2026-01-19 02:41:56.824	2026-01-19 02:41:56.824	100.0000	\N	\N	\N	\N	WEIGHTED_AVERAGE	\N
0e5d730f-9d6c-4445-b20d-b3901f8c9205	0384b223-34fe-4887-868f-48802bc2e498	HDP Hijau 	RMHDH001	10000.00	10000.00	\N	KG	BAL	25.0000	{"color": "Green", "material": "Resin"}	2026-01-19 02:41:56.828	2026-01-19 02:41:56.828	100.0000	\N	\N	\N	\N	WEIGHTED_AVERAGE	\N
7a5251cc-18d8-4f78-833c-afd4fdc8c9b5	0384b223-34fe-4887-868f-48802bc2e498	HDP Kuning	RMHDK001	10000.00	10000.00	\N	KG	BAL	25.0000	{"color": "Yellow", "material": "Resin"}	2026-01-19 02:41:56.834	2026-01-19 02:41:56.834	100.0000	\N	\N	\N	\N	WEIGHTED_AVERAGE	\N
534c06cf-cf1f-4014-bdfc-e99820d04469	0384b223-34fe-4887-868f-48802bc2e498	HDP Pink 	RMPNK001	10000.00	10000.00	\N	KG	BAL	25.0000	{"color": "Pink", "material": "Resin"}	2026-01-19 02:41:56.839	2026-01-19 02:41:56.839	100.0000	\N	\N	\N	\N	WEIGHTED_AVERAGE	\N
5f44845e-fbae-4fd8-8338-5b6cad10fbd1	0384b223-34fe-4887-868f-48802bc2e498	HDP Biru 	RMHDB001	10000.00	10000.00	\N	KG	BAL	25.0000	{"color": "Blue", "material": "Resin"}	2026-01-19 02:41:56.844	2026-01-19 02:41:56.844	100.0000	\N	\N	\N	\N	WEIGHTED_AVERAGE	\N
94fff4c0-f8c1-4451-933c-8e6a19efc41d	0384b223-34fe-4887-868f-48802bc2e498	HD Biru 	RMHDB002	10000.00	10000.00	\N	KG	BAL	25.0000	{"color": "Blue", "material": "Resin"}	2026-01-19 02:41:56.847	2026-01-19 02:41:56.847	100.0000	\N	\N	\N	\N	WEIGHTED_AVERAGE	\N
4b88c5d3-24ea-45c3-90db-c19715eb600e	6f4c43fd-01f7-4176-bb3e-8b4ba93a46c5	Pelembab	RMPMB001	11000.00	11000.00	\N	KG	BAL	5.0000	{"color": "Grey", "material": "Additive"}	2026-01-19 02:41:56.867	2026-01-19 02:41:56.867	100.0000	\N	\N	\N	\N	WEIGHTED_AVERAGE	\N
b1df47f8-bb81-4eef-92b1-257cc70a8c52	79e4d827-4ef4-4756-87f1-5ccbb556a9f1	Bright	RMBRG001	555000.00	555000.00	\N	KG	BAL	25.0000	{"color": "Hijau", "material": "Additive"}	2026-01-19 02:41:56.873	2026-01-19 02:41:56.873	100.0000	\N	\N	\N	\N	WEIGHTED_AVERAGE	\N
65baaa0c-defe-4c8d-87bf-9b2ab2a0874a	0383ae6d-d1d0-4d03-bf60-f25da5fbe61f	MP 15	FGHMP015	21500.00	21500.00	\N	KG	BAL	25.0000	{"color": "Clear", "material": "Plastic Bag"}	2026-01-19 02:41:56.879	2026-01-19 02:41:56.879	125.0000	\N	\N	\N	\N	WEIGHTED_AVERAGE	\N
ce7f996e-3a3b-4d93-bbb1-52c818f9e779	0383ae6d-d1d0-4d03-bf60-f25da5fbe61f	MP 21	FGHMP021	21500.00	21500.00	\N	KG	BAL	25.0000	{"color": "Clear", "material": "Plastic Bag"}	2026-01-19 02:41:56.883	2026-01-19 02:41:56.883	125.0000	\N	\N	\N	\N	WEIGHTED_AVERAGE	\N
16ff1042-ff62-463e-a352-c0dd5cfcdc7c	905eb466-fe9d-4c06-a07b-b5948b6da037	Violet 5117	RMVIO511	79500.00	79500.00	\N	KG	KG	1.0000	{"color": "Violet", "material": "Masterbatch"}	2026-01-19 02:41:56.858	2026-01-20 08:58:29.192	100.0000	\N	\N	\N	\N	WEIGHTED_AVERAGE	\N
80b4a915-29ed-44f9-8b3a-2036877e49b9	369c44b8-d894-405c-860b-4b8fc8233901	Mixing Orange Jumbo	INMIX012	\N	\N	\N	KG	KG	1.0000	\N	2026-01-20 08:34:17.872	2026-01-20 08:34:17.872	\N	\N	\N	\N	\N	WEIGHTED_AVERAGE	\N
68e92ebb-6fce-4483-bc9d-cc0ab1d001cb	b36c98e1-8e27-476f-a19d-5c6a3c57b495	HD TRANS 2	RMHDT002	10000.00	10000.00	\N	KG	BAL	25.0000	{"color": "Grey", "material": "Resin"}	2026-01-19 02:41:56.718	2026-01-21 01:45:18.593	100.0000	\N	\N	\N	\N	WEIGHTED_AVERAGE	2050.1139
dca00a7c-3d85-47ed-8559-da9659a102c1	0384b223-34fe-4887-868f-48802bc2e498	HDP Ungu	RMHDU001	10000.00	10000.00	\N	KG	BAL	25.0000	{"color": "Purple", "material": "Resin"}	2026-01-19 02:41:56.801	2026-01-21 02:19:14.503	100.0000	\N	\N	\N	\N	WEIGHTED_AVERAGE	3953.7713
f7eb4c8c-6e14-4709-9590-1bebf0633feb	905eb466-fe9d-4c06-a07b-b5948b6da037	Violet 5232	RMVIO523	65000.00	65000.00	\N	KG	KG	1.0000	{"color": "Violet", "material": "Masterbatch"}	2026-01-19 02:41:56.854	2026-01-20 08:58:29.195	100.0000	\N	\N	\N	\N	WEIGHTED_AVERAGE	\N
e0186b2d-742e-4526-8500-08a5ea4a0a44	369c44b8-d894-405c-860b-4b8fc8233901	Mixing Kuning Jumbo	INMIX013	\N	\N	\N	KG	KG	1.0000	\N	2026-01-20 08:34:17.876	2026-01-20 08:34:17.876	\N	\N	\N	\N	\N	WEIGHTED_AVERAGE	\N
e386871b-e654-463d-968a-c67370387d04	369c44b8-d894-405c-860b-4b8fc8233901	Mixing Pink Jumbo	INMIX014	\N	\N	\N	KG	KG	1.0000	\N	2026-01-20 08:34:17.881	2026-01-20 08:34:17.881	\N	\N	\N	\N	\N	WEIGHTED_AVERAGE	\N
9dda0cd7-31bb-469e-8891-fe88c5e01d33	0383ae6d-d1d0-4d03-bf60-f25da5fbe61f	MP 24	FGHMP024	21500.00	21500.00	\N	KG	BAL	25.0000	{"color": "Clear", "material": "Plastic Bag"}	2026-01-19 02:41:56.887	2026-01-19 02:41:56.887	125.0000	\N	\N	\N	\N	WEIGHTED_AVERAGE	\N
c325b4c0-73d7-4aff-b9bf-52d72bbda84c	0383ae6d-d1d0-4d03-bf60-f25da5fbe61f	MP 28	FGHMP028	21500.00	21500.00	\N	KG	BAL	25.0000	{"color": "Clear", "material": "Plastic Bag"}	2026-01-19 02:41:56.901	2026-01-19 02:41:56.901	125.0000	\N	\N	\N	\N	WEIGHTED_AVERAGE	\N
0c41e285-16e5-4ba1-b688-8cde225e9d21	0383ae6d-d1d0-4d03-bf60-f25da5fbe61f	MP ORI 15	FGMPO015	22500.00	22500.00	\N	KG	BAL	25.0000	{"color": "Clear", "material": "Plastic Bag"}	2026-01-19 02:41:56.905	2026-01-19 02:41:56.905	125.0000	\N	\N	\N	\N	WEIGHTED_AVERAGE	\N
e5c741e6-7652-4e66-92c1-c80587df7b86	0383ae6d-d1d0-4d03-bf60-f25da5fbe61f	MP ORI 21	FGMPO021	22500.00	22500.00	\N	KG	BAL	25.0000	{"color": "Clear", "material": "Plastic Bag"}	2026-01-19 02:41:56.909	2026-01-19 02:41:56.909	125.0000	\N	\N	\N	\N	WEIGHTED_AVERAGE	\N
29ba31bb-ce83-47e1-9865-0c05c06c8a4b	0383ae6d-d1d0-4d03-bf60-f25da5fbe61f	MP ORI 24	FGMPO024	22500.00	22500.00	\N	KG	BAL	25.0000	{"color": "Clear", "material": "Plastic Bag"}	2026-01-19 02:41:56.913	2026-01-19 02:41:56.913	125.0000	\N	\N	\N	\N	WEIGHTED_AVERAGE	\N
976d3eba-a011-4d35-9773-d5b4dd613551	0383ae6d-d1d0-4d03-bf60-f25da5fbe61f	MP ORI 28	FGMPO028	22500.00	22500.00	\N	KG	BAL	25.0000	{"color": "Clear", "material": "Plastic Bag"}	2026-01-19 02:41:56.919	2026-01-19 02:41:56.919	125.0000	\N	\N	\N	\N	WEIGHTED_AVERAGE	\N
a53bb9ea-adab-486d-8db6-0197e4c1ea76	0383ae6d-d1d0-4d03-bf60-f25da5fbe61f	AGUNGTEX	FGAGT035	22250.00	22250.00	\N	KG	BAL	25.0000	{"color": "Clear", "material": "Plastic Bag"}	2026-01-19 02:41:56.923	2026-01-19 02:41:56.923	125.0000	\N	\N	\N	\N	WEIGHTED_AVERAGE	\N
67afcf50-f8a2-4dea-ad11-733acc19682f	3412ec72-1893-416d-a251-7bbea1fcc92f	UNGU 15	FGHUR015	19000.00	19000.00	\N	KG	BAL	25.0000	{"color": "Violet", "material": "Plastic Bag"}	2026-01-19 02:41:56.93	2026-01-19 02:41:56.93	125.0000	\N	\N	\N	\N	WEIGHTED_AVERAGE	\N
0fc1f30b-43d3-4f84-8876-5402bc8c5e65	3412ec72-1893-416d-a251-7bbea1fcc92f	UNGU 21	FGHUR021	19000.00	19000.00	\N	KG	BAL	25.0000	{"color": "Violet", "material": "Plastic Bag"}	2026-01-19 02:41:56.934	2026-01-19 02:41:56.934	125.0000	\N	\N	\N	\N	WEIGHTED_AVERAGE	\N
0da6d9f3-6a7c-492f-a204-d82b86a36b5f	3412ec72-1893-416d-a251-7bbea1fcc92f	UNGU 24	FGHUR024	19000.00	19000.00	\N	KG	BAL	25.0000	{"color": "Violet", "material": "Plastic Bag"}	2026-01-19 02:41:56.937	2026-01-19 02:41:56.937	125.0000	\N	\N	\N	\N	WEIGHTED_AVERAGE	\N
53d5fd3f-f333-4961-b244-6d7220b29d1d	3412ec72-1893-416d-a251-7bbea1fcc92f	UNGU 28	FGHUR028	19000.00	19000.00	\N	KG	BAL	25.0000	{"color": "Violet", "material": "Plastic Bag"}	2026-01-19 02:41:56.941	2026-01-19 02:41:56.941	125.0000	\N	\N	\N	\N	WEIGHTED_AVERAGE	\N
b903b729-2e91-44ee-b83c-b3c5554e49a0	27fdcf72-b73d-47c8-b99c-06dc797573d0	HD PUTIH	FGHPR024	\N	\N	\N	KG	BAL	25.0000	{"color": "White", "material": "Plastic Bag"}	2026-01-19 02:41:56.947	2026-01-19 02:41:56.947	125.0000	\N	\N	\N	\N	WEIGHTED_AVERAGE	\N
dd7a7330-3851-4747-bdec-46d339148e9f	a9bee487-2f4a-4588-99f4-11d92bbbb592	PG OZ	FGPGO010	\N	\N	\N	KG	BAL	25.0000	{"color": "Clear", "material": "Plastic Bag"}	2026-01-19 02:41:56.955	2026-01-19 02:41:56.955	125.0000	\N	\N	\N	\N	WEIGHTED_AVERAGE	\N
41c20290-7fe7-46da-afb9-8bfe11077d05	1e9226de-3988-4936-8c3d-a73c1f6aa45a	MERAH JUMBO	FGHMJ040	19000.00	19000.00	\N	KG	BAL	25.0000	{"color": "REd", "material": "Plastic Bag"}	2026-01-19 02:41:56.961	2026-01-19 02:41:56.961	125.0000	\N	\N	\N	\N	WEIGHTED_AVERAGE	\N
e61096c6-92b5-4b46-b828-3a2a25bf6fb6	1e9226de-3988-4936-8c3d-a73c1f6aa45a	UNGU JUMBO	FGHUJ040	19000.00	19000.00	\N	KG	BAL	25.0000	{"color": "VIolet", "material": "Plastic Bag"}	2026-01-19 02:41:56.965	2026-01-19 02:41:56.965	125.0000	\N	\N	\N	\N	WEIGHTED_AVERAGE	\N
c07a7d2d-a068-4f33-adac-00af64ce08d3	1e9226de-3988-4936-8c3d-a73c1f6aa45a	BIRU JUMBO	FGHBJ040	19000.00	19000.00	\N	KG	BAL	25.0000	{"color": "Blue", "material": "Plastic Bag"}	2026-01-19 02:41:56.97	2026-01-19 02:41:56.97	125.0000	\N	\N	\N	\N	WEIGHTED_AVERAGE	\N
510fe8a8-1a9f-4439-bdd2-7ed9a4dddd1a	1e9226de-3988-4936-8c3d-a73c1f6aa45a	HIJAU JUMBO	FGHHJ040	19000.00	19000.00	\N	KG	BAL	25.0000	{"color": "Green", "material": "Plastic Bag"}	2026-01-19 02:41:56.975	2026-01-19 02:41:56.975	125.0000	\N	\N	\N	\N	WEIGHTED_AVERAGE	\N
48c41b36-7cad-49d6-9f2c-94e7bce32725	1e9226de-3988-4936-8c3d-a73c1f6aa45a	PINK JUMBO	FGHPJ040	19000.00	19000.00	\N	KG	BAL	25.0000	{"color": "Pink", "material": "Plastic Bag"}	2026-01-19 02:41:56.981	2026-01-19 02:41:56.981	125.0000	\N	\N	\N	\N	WEIGHTED_AVERAGE	\N
c35a2345-0a2c-471f-a6e8-32e0589c1576	1e9226de-3988-4936-8c3d-a73c1f6aa45a	ORANGE JUMBO	FGHOJ040	19000.00	19000.00	\N	KG	BAL	25.0000	{"color": "Orange", "material": "Plastic Bag"}	2026-01-19 02:41:56.986	2026-01-19 02:41:56.986	125.0000	\N	\N	\N	\N	WEIGHTED_AVERAGE	\N
979d2b8f-b2c6-4a97-b578-ac58daa29d36	1e9226de-3988-4936-8c3d-a73c1f6aa45a	HIJAU 15	FGHHR015	19000.00	19000.00	\N	KG	BAL	25.0000	{"color": "Green", "material": "Plastic Bag"}	2026-01-19 02:41:56.989	2026-01-19 02:41:56.989	125.0000	\N	\N	\N	\N	WEIGHTED_AVERAGE	\N
13456454-f06b-4b92-adf1-f362a7aa4dbd	905eb466-fe9d-4c06-a07b-b5948b6da037	BLUE 97091	RMBLU970	127000.00	\N	\N	KG	KG	1.0000	\N	2026-01-20 08:18:49.275	2026-01-20 08:58:29.17	\N	\N	\N	\N	\N	WEIGHTED_AVERAGE	\N
0635d93b-ffbe-403d-8a05-bb2835cf4d73	75f416cf-483b-4711-8297-3d54fbe0bb3d	Mixing HD Ungu Reguler	INMIX001	\N	\N	\N	KG	KG	1.0000	\N	2026-01-19 03:01:59.559	2026-01-20 04:41:55.366	\N	\N	\N	\N	\N	WEIGHTED_AVERAGE	\N
02f84342-0b5a-4f49-b235-69a874684f36	a7916cad-e8d3-43b8-8f51-099acd7a7681	Mixing MP Trans	INMIX002	\N	\N	\N	KG	KG	1.0000	\N	2026-01-20 04:27:53.145	2026-01-20 04:42:16.822	100.0000	\N	\N	\N	\N	WEIGHTED_AVERAGE	\N
380cb5ef-cae6-4a06-8f99-e14ad7850bb4	01dda341-50bb-47c3-b840-e937ef12af66	Mixing MP Trans AGT	INMIX004	\N	\N	\N	KG	KG	1.0000	\N	2026-01-20 04:30:43.079	2026-01-20 04:42:51.312	100.0000	\N	\N	\N	\N	WEIGHTED_AVERAGE	\N
135f559a-fde6-418f-bc4b-8d305fa2fdf6	54d59e4a-d6e5-411e-b8c0-5bda5edcf692	Mixing MP Trans Ori	INMIX003	\N	\N	\N	KG	KG	1.0000	\N	2026-01-20 04:28:52.854	2026-01-20 04:43:11.735	100.0000	\N	\N	\N	\N	WEIGHTED_AVERAGE	\N
465b0621-317c-4f66-9dbf-d216568070d5	905eb466-fe9d-4c06-a07b-b5948b6da037	Green 81515	RMGRN815	68000.00	\N	\N	KG	KG	1.0000	\N	2026-01-20 08:22:14.958	2026-01-20 08:58:29.177	\N	\N	\N	\N	\N	WEIGHTED_AVERAGE	\N
dc4a45b1-f788-46b3-8dee-d3fc40b43fb1	905eb466-fe9d-4c06-a07b-b5948b6da037	Green 8235	RMGRN823	51000.00	\N	\N	KG	KG	1.0000	\N	2026-01-20 08:22:14.963	2026-01-20 08:58:29.181	\N	\N	\N	\N	\N	WEIGHTED_AVERAGE	\N
133db924-885f-44ae-b38b-31998f6a3ad8	905eb466-fe9d-4c06-a07b-b5948b6da037	Red 63691	RMRED636	62000.00	\N	\N	KG	KG	1.0000	\N	2026-01-20 08:22:14.975	2026-01-20 08:58:29.189	\N	\N	\N	\N	\N	WEIGHTED_AVERAGE	\N
29b14218-c384-4b58-90fa-bbde1b923e46	369c44b8-d894-405c-860b-4b8fc8233901	Mixing Merah Jumbo	INMIX008	\N	\N	\N	KG	KG	1.0000	\N	2026-01-20 08:30:45.297	2026-01-20 08:34:17.846	\N	\N	\N	\N	\N	WEIGHTED_AVERAGE	\N
e20bba24-260f-4333-9ad6-7b70b32c9c41	369c44b8-d894-405c-860b-4b8fc8233901	Mixing Biru Jumbo	INMIX009	\N	\N	\N	KG	KG	1.0000	\N	2026-01-20 08:34:17.853	2026-01-20 08:34:17.853	\N	\N	\N	\N	\N	WEIGHTED_AVERAGE	\N
f7653b4c-9b8a-4905-ac15-3cdc41afb342	369c44b8-d894-405c-860b-4b8fc8233901	Mixing Hijau Jumbo	INMIX010	\N	\N	\N	KG	KG	1.0000	\N	2026-01-20 08:34:17.861	2026-01-20 08:34:17.861	\N	\N	\N	\N	\N	WEIGHTED_AVERAGE	\N
2e59d8a5-f799-4ed7-852a-5b7ede4a6bdf	369c44b8-d894-405c-860b-4b8fc8233901	Mixing Ungu Jumbo	INMIX011	\N	\N	\N	KG	KG	1.0000	\N	2026-01-20 08:34:17.866	2026-01-20 08:34:17.866	\N	\N	\N	\N	\N	WEIGHTED_AVERAGE	\N
3f13d8e5-c7fd-4fb8-8cfc-9d7abc8257ad	905eb466-fe9d-4c06-a07b-b5948b6da037	ORANGE 2111	RMORG001	70000.00	\N	\N	KG	KG	1.0000	\N	2026-01-20 08:46:58.682	2026-01-20 08:58:29.185	\N	\N	\N	\N	\N	WEIGHTED_AVERAGE	\N
1a271240-409d-4e70-9bd0-754814a60655	905eb466-fe9d-4c06-a07b-b5948b6da037	Yellow 7111	RMYLW711	51500.00	\N	\N	KG	KG	1.0000	\N	2026-01-20 08:22:14.967	2026-01-20 08:58:29.201	\N	\N	\N	\N	\N	WEIGHTED_AVERAGE	\N
caafd463-de72-4fc7-bcad-54cc0a598958	905eb466-fe9d-4c06-a07b-b5948b6da037	Yellow 743	RMYLW743	41500.00	\N	\N	KG	KG	1.0000	\N	2026-01-20 08:22:14.971	2026-01-20 08:58:29.206	\N	\N	\N	\N	\N	WEIGHTED_AVERAGE	\N
2368fd60-5592-47fd-a97d-daf760ea17da	905eb466-fe9d-4c06-a07b-b5948b6da037	PINK KC	RMPNK003	\N	\N	\N	KG	KG	1.0000	\N	2026-01-20 08:58:29.211	2026-01-20 08:58:29.211	\N	\N	\N	\N	\N	WEIGHTED_AVERAGE	\N
3e853398-9217-4ce9-a6df-13d87fda3632	b62cc37c-d67a-4fe6-ad7e-ef24cbac8591	Mixing PG OZ	INMIX015	28000.00	\N	\N	KG	KG	1.0000	\N	2026-01-21 01:22:09.898	2026-01-21 01:22:09.898	100.0000	\N	\N	\N	\N	WEIGHTED_AVERAGE	\N
\.


--
-- Data for Name: ProductionExecution; Type: TABLE DATA; Schema: public; Owner: polyflow
--

COPY public."ProductionExecution" (id, "productionOrderId", "machineId", "operatorId", "shiftId", "quantityProduced", "scrapQuantity", "startTime", "endTime", notes, "createdAt", "updatedAt") FROM stdin;
51d1d6c8-0679-416e-a597-9286cd667fb8	1d49608d-970f-4ae8-8e20-28258a5f0d40	7533b3c2-fcfd-4470-aa8d-74a9c050d5db	\N	\N	549.0000	0.0000	2026-01-21 02:49:21.005	2026-01-21 02:49:47.411		2026-01-21 02:49:21.007	2026-01-21 02:49:47.412
\.


--
-- Data for Name: ProductionMaterial; Type: TABLE DATA; Schema: public; Owner: polyflow
--

COPY public."ProductionMaterial" (id, "productionOrderId", "productVariantId", quantity, "createdAt", "updatedAt") FROM stdin;
686781ad-6883-4de7-a910-e1678a9a34d2	1d49608d-970f-4ae8-8e20-28258a5f0d40	5fc56a9d-a649-4654-be01-40545adb299b	250.0000	2026-01-21 02:40:37.993	2026-01-21 02:40:37.993
22c42670-ec60-492c-a27d-71ae23824d62	1d49608d-970f-4ae8-8e20-28258a5f0d40	c94295dc-bf84-4f89-9a76-c352b90986ce	100.0000	2026-01-21 02:40:37.993	2026-01-21 02:40:37.993
40ac744d-f78a-49ab-adf2-2e9c175b72cd	1d49608d-970f-4ae8-8e20-28258a5f0d40	94fff4c0-f8c1-4451-933c-8e6a19efc41d	25.0000	2026-01-21 02:40:37.993	2026-01-21 02:40:37.993
8e150b9f-17e7-4a4b-91d8-b74353545dee	1d49608d-970f-4ae8-8e20-28258a5f0d40	dca00a7c-3d85-47ed-8559-da9659a102c1	50.0000	2026-01-21 02:40:37.993	2026-01-21 02:40:37.993
9592a53e-6a4c-4024-8ad5-d1cd375bc294	1d49608d-970f-4ae8-8e20-28258a5f0d40	68e92ebb-6fce-4483-bc9d-cc0ab1d001cb	75.0000	2026-01-21 02:40:37.993	2026-01-21 02:40:37.993
a29b072a-7b5f-4494-9a92-e51798686f23	1d49608d-970f-4ae8-8e20-28258a5f0d40	15298147-4624-4921-a762-da82ec5e19f1	7.5000	2026-01-21 02:40:37.993	2026-01-21 02:40:37.993
2d26bc81-b211-4bd0-8994-0bf6a5baae1f	1d49608d-970f-4ae8-8e20-28258a5f0d40	30ecde3c-b399-4359-af4f-c98bd11c5db6	7.5000	2026-01-21 02:40:37.993	2026-01-21 02:40:37.993
2806b73d-cf0f-4254-af5a-9fefc3d693f5	1d49608d-970f-4ae8-8e20-28258a5f0d40	db9bac3b-0832-43c3-bfef-123ffe9db980	12.5000	2026-01-21 02:40:37.993	2026-01-21 02:40:37.993
14c4077a-c273-4b50-ab72-143aa68e9770	1d49608d-970f-4ae8-8e20-28258a5f0d40	4b88c5d3-24ea-45c3-90db-c19715eb600e	4.0000	2026-01-21 02:40:37.993	2026-01-21 02:40:37.993
3e7f9edd-5c7e-40f2-9f96-67473e7c69a3	1d49608d-970f-4ae8-8e20-28258a5f0d40	16ff1042-ff62-463e-a352-c0dd5cfcdc7c	17.5000	2026-01-21 02:40:37.993	2026-01-21 02:40:37.993
9bbd0077-d9e4-4ab9-af02-5f59aebfe05d	3787262c-22e2-4efa-90de-e2ce55f355f7	68e92ebb-6fce-4483-bc9d-cc0ab1d001cb	25.0000	2026-01-21 02:56:21.22	2026-01-21 02:56:21.22
0ec27343-7032-4a90-95a3-2f38fb0faee6	3787262c-22e2-4efa-90de-e2ce55f355f7	5fc56a9d-a649-4654-be01-40545adb299b	15.0000	2026-01-21 02:56:21.22	2026-01-21 02:56:21.22
a84d3205-ba27-4492-9b4d-63a829017b22	3787262c-22e2-4efa-90de-e2ce55f355f7	dca00a7c-3d85-47ed-8559-da9659a102c1	35.0000	2026-01-21 02:56:21.22	2026-01-21 02:56:21.22
cfb7da85-6df2-456e-841e-f69905099fb9	3787262c-22e2-4efa-90de-e2ce55f355f7	db9bac3b-0832-43c3-bfef-123ffe9db980	2.5000	2026-01-21 02:56:21.22	2026-01-21 02:56:21.22
89cc3ed9-d21e-4b0c-ab79-349eb3324f4a	3787262c-22e2-4efa-90de-e2ce55f355f7	15298147-4624-4921-a762-da82ec5e19f1	1.2500	2026-01-21 02:56:21.22	2026-01-21 02:56:21.22
211109b6-d101-46fa-8d58-0309d855d29b	3787262c-22e2-4efa-90de-e2ce55f355f7	30ecde3c-b399-4359-af4f-c98bd11c5db6	1.2500	2026-01-21 02:56:21.22	2026-01-21 02:56:21.22
39bbbc15-71d0-4871-b9db-d265862d76f0	3787262c-22e2-4efa-90de-e2ce55f355f7	c94295dc-bf84-4f89-9a76-c352b90986ce	20.0000	2026-01-21 02:56:21.22	2026-01-21 02:56:21.22
22fc5aba-c5fb-420b-80a4-c7ed174ef757	3787262c-22e2-4efa-90de-e2ce55f355f7	16ff1042-ff62-463e-a352-c0dd5cfcdc7c	3.5000	2026-01-21 02:56:21.22	2026-01-21 02:56:21.22
a4326bff-68d9-4106-be8a-0ca55cc1942f	3787262c-22e2-4efa-90de-e2ce55f355f7	4b88c5d3-24ea-45c3-90db-c19715eb600e	0.8000	2026-01-21 02:56:21.22	2026-01-21 02:56:21.22
\.


--
-- Data for Name: ProductionOrder; Type: TABLE DATA; Schema: public; Owner: polyflow
--

COPY public."ProductionOrder" (id, "orderNumber", "bomId", "plannedQuantity", "plannedStartDate", "plannedEndDate", "actualQuantity", "actualStartDate", "actualEndDate", status, "machineId", "locationId", "createdById", "createdAt", "updatedAt", notes, "salesOrderId") FROM stdin;
1d49608d-970f-4ae8-8e20-28258a5f0d40	PO-260121-MIX25	139aa05f-01db-41b8-b42a-8d368f9cc44c	549.0000	2026-01-21 02:40:07.122	\N	549.0000	\N	\N	COMPLETED	7533b3c2-fcfd-4470-aa8d-74a9c050d5db	0c882912-ebec-44e4-8431-bae328a11436	\N	2026-01-21 02:40:37.975	2026-01-21 02:50:26.417	Production SPD	\N
3787262c-22e2-4efa-90de-e2ce55f355f7	PO-260121-MIX74	c2e09623-337f-4ecc-bc52-02e4ea484050	104.3000	2026-01-21 02:56:12.231	\N	0.0000	\N	\N	RELEASED	\N	0c882912-ebec-44e4-8431-bae328a11436	\N	2026-01-21 02:56:21.21	2026-01-21 02:56:26.79		\N
\.


--
-- Data for Name: ProductionShift; Type: TABLE DATA; Schema: public; Owner: polyflow
--

COPY public."ProductionShift" (id, "productionOrderId", "shiftName", "startTime", "endTime", "operatorId", "outputQuantity", notes, "createdAt", "updatedAt") FROM stdin;
800d1c73-610f-4b4c-9fa9-6f8a07b239e3	1d49608d-970f-4ae8-8e20-28258a5f0d40	Shift 1	2026-01-21 01:00:00	2026-01-21 09:00:00	\N	\N	\N	2026-01-21 02:45:19.186	2026-01-21 02:45:19.186
\.


--
-- Data for Name: PurchaseInvoice; Type: TABLE DATA; Schema: public; Owner: polyflow
--

COPY public."PurchaseInvoice" (id, "invoiceNumber", "purchaseOrderId", "invoiceDate", "dueDate", status, "totalAmount", "paidAmount", notes, "createdAt", "updatedAt") FROM stdin;
fdd77bb1-e208-41ec-8872-9d947e544412	INV-PO-2026-0001	23fd708f-f39e-4db6-9b63-45a116b06a66	2026-01-21 01:45:23.517	2026-02-20 01:45:23.517	UNPAID	4500000.00	0.00	\N	2026-01-21 01:45:23.879	2026-01-21 01:45:23.879
7687d9ba-b663-47e2-8b45-48250e652c78	INV-PO-2026-0002	92399630-81ec-4ef5-ada1-32b0c7ff3e11	2026-01-21 02:19:22.583	2026-02-20 02:19:22.583	UNPAID	6500000.00	0.00	\N	2026-01-21 02:19:21.771	2026-01-21 02:19:21.771
\.


--
-- Data for Name: PurchaseOrder; Type: TABLE DATA; Schema: public; Owner: polyflow
--

COPY public."PurchaseOrder" (id, "orderNumber", "supplierId", "orderDate", "expectedDate", status, "totalAmount", notes, "createdById", "createdAt", "updatedAt") FROM stdin;
23fd708f-f39e-4db6-9b63-45a116b06a66	PO-2026-0001	7bdc29b5-082a-4eac-9b5b-aa4f7cd8546b	2026-01-21 01:44:27.383	2026-01-28 01:44:27.383	RECEIVED	4500000.00		a8971ec0-a686-43b0-aec0-53d383321331	2026-01-21 01:45:00.289	2026-01-21 01:45:18.617
92399630-81ec-4ef5-ada1-32b0c7ff3e11	PO-2026-0002	f3758a59-9e97-4ef4-b9ca-86469a8ac62a	2026-01-21 02:17:41.244	2026-01-19 00:00:00	RECEIVED	6500000.00		f0000eff-2dfa-4cad-8669-0243b1f9f51e	2026-01-21 02:18:47.962	2026-01-21 02:19:14.533
\.


--
-- Data for Name: PurchaseOrderItem; Type: TABLE DATA; Schema: public; Owner: polyflow
--

COPY public."PurchaseOrderItem" (id, "purchaseOrderId", "productVariantId", quantity, "unitPrice", subtotal, "receivedQty") FROM stdin;
90df869c-026d-461f-b9b3-9c8287ceab6c	23fd708f-f39e-4db6-9b63-45a116b06a66	68e92ebb-6fce-4483-bc9d-cc0ab1d001cb	375.0000	12000.0000	4500000.00	375.0000
2efa411a-df6a-414c-ba3c-d2e79da19dd3	92399630-81ec-4ef5-ada1-32b0c7ff3e11	dca00a7c-3d85-47ed-8559-da9659a102c1	650.0000	10000.0000	6500000.00	650.0000
\.


--
-- Data for Name: PurchasePayment; Type: TABLE DATA; Schema: public; Owner: polyflow
--

COPY public."PurchasePayment" (id, "purchaseInvoiceId", amount, "paymentDate", "paymentMethod", reference, notes, "createdById", "createdAt") FROM stdin;
\.


--
-- Data for Name: QualityInspection; Type: TABLE DATA; Schema: public; Owner: polyflow
--

COPY public."QualityInspection" (id, "productionOrderId", "inspectorId", result, notes, "inspectedAt") FROM stdin;
\.


--
-- Data for Name: RolePermission; Type: TABLE DATA; Schema: public; Owner: polyflow
--

COPY public."RolePermission" (id, role, resource, "canAccess", "createdAt", "updatedAt") FROM stdin;
5b8a1b37-68f4-4c81-885a-0301f20aaeab	PPIC	/dashboard	t	2026-01-18 03:02:45.198	2026-01-18 03:02:45.198
10eae3e1-f8f2-4df9-81dd-2f3069e4c190	PPIC	/dashboard/analytics	t	2026-01-18 03:02:45.963	2026-01-18 03:02:45.963
da099d8b-41fa-46b0-8e93-6d1c4ff53151	PPIC	/dashboard/inventory	t	2026-01-18 03:02:47.114	2026-01-18 03:02:47.114
538d165e-4061-46e1-9f32-8d96078960c9	PPIC	/dashboard/inventory/transfer	t	2026-01-18 03:02:49.776	2026-01-18 03:02:49.776
592063ff-cc6b-4c57-b219-927d4974a7d5	PPIC	/dashboard/inventory/adjustment	t	2026-01-18 03:02:50.766	2026-01-18 03:02:50.766
701a2051-45a9-4f2f-aba9-523c50658245	PPIC	/dashboard/inventory/opname	t	2026-01-18 03:02:51.631	2026-01-18 03:02:51.631
8ac79863-780d-4170-9c43-6b9eea7e306e	PPIC	/dashboard/inventory/history	t	2026-01-18 03:02:52.36	2026-01-18 03:02:52.36
76a3febe-c014-452a-8996-ad7564979fc0	PPIC	/dashboard/production/orders	t	2026-01-18 03:02:53.185	2026-01-18 03:02:53.185
3a36733c-c871-47c3-b368-ff116ad91a95	PPIC	/dashboard/production/kiosk	t	2026-01-18 03:02:53.763	2026-01-18 03:02:53.763
15dfb89e-2d01-4c08-a986-56027857e314	PPIC	/dashboard/products	t	2026-01-18 03:02:55.303	2026-01-18 03:02:55.303
b8fd8ef0-9b7b-4b32-8a78-128e14734fad	PPIC	/dashboard/production/boms	t	2026-01-18 03:02:55.8	2026-01-18 03:02:55.8
f3536c63-0dc3-4a14-8d82-dc206876903b	PPIC	/dashboard/suppliers	t	2026-01-18 03:02:56.888	2026-01-18 03:02:56.888
86b492a4-e975-4c06-9dd5-8f8ee99dc5eb	PPIC	/dashboard/production/resources/machines	t	2026-01-18 03:03:00.048	2026-01-18 03:03:00.048
056282b9-bd35-4d22-83d8-2c8330567e92	PPIC	/dashboard/production/resources/employees	t	2026-01-18 03:03:01.787	2026-01-18 03:03:01.787
8e0a4b75-40d3-4813-b3f6-6d9ae5a1627a	PPIC	/dashboard/sales	t	2026-01-20 01:43:35.297	2026-01-20 01:43:35.297
f2d86265-3b0e-4c6a-91df-07e34504ef21	PPIC	/dashboard/sales/invoices	t	2026-01-20 01:43:36.184	2026-01-20 01:43:36.184
eb943312-89b0-45e5-a81f-7fce7fe0823d	PPIC	/dashboard/sales/analytics	t	2026-01-20 01:43:36.963	2026-01-20 01:43:36.963
55c3dee7-d295-41e9-8825-a411bec09133	PPIC	/dashboard/production/analytics	t	2026-01-20 01:43:39.498	2026-01-20 01:43:39.498
d23da381-2d5c-4309-a725-90d94b2ff29a	PPIC	/dashboard/customers	t	2026-01-20 01:43:41.178	2026-01-20 01:43:41.178
6e3dee1b-8b26-4b14-b609-bbdcc1756d48	PPIC	feature:view-prices	f	2026-01-19 08:34:07.793	2026-01-21 01:35:58.177
53fd9b69-1beb-4bbf-b1bc-6d4733a68ada	PPIC	/dashboard/inventory/aging	t	2026-01-21 01:46:05.62	2026-01-21 01:46:05.62
aea65ca8-1eea-4ae2-b43f-67d175809d06	PPIC	/dashboard/inventory/analytics	t	2026-01-21 01:46:07.248	2026-01-21 01:46:07.248
b0f02c8a-325c-4678-831f-4ba61a65a696	PPIC	/dashboard/purchasing/orders	t	2026-01-21 01:46:09.985	2026-01-21 01:46:09.985
83e1dd67-0a79-492d-90f8-1e65756503a6	PPIC	/dashboard/purchasing/receipts	t	2026-01-21 01:46:11.003	2026-01-21 01:46:11.003
4f8733f7-1283-4e6d-a891-80ad098fef87	PPIC	/dashboard/purchasing/invoices	t	2026-01-21 01:46:13.584	2026-01-21 01:46:13.584
\.


--
-- Data for Name: SalesOrder; Type: TABLE DATA; Schema: public; Owner: polyflow
--

COPY public."SalesOrder" (id, "orderNumber", "customerId", "orderDate", "expectedDate", "orderType", status, "sourceLocationId", "totalAmount", notes, "createdById", "createdAt", "updatedAt", "discountAmount", "taxAmount", "quotationId") FROM stdin;
07ebed5c-9874-4766-b6e9-0db5440e4dd1	SO-2026-0001	91c2fccf-3d1d-48eb-bd0e-418a49ad0d8d	2026-01-17 17:00:00	2026-01-19 17:00:00	MAKE_TO_ORDER	DELIVERED	0452f60e-9518-4a8b-ad5b-5e6d46297c4a	16875000.00	Order From Andri Pacitan	f0000eff-2dfa-4cad-8669-0243b1f9f51e	2026-01-21 03:03:06.186	2026-01-21 03:03:52.639	0.00	0.00	\N
\.


--
-- Data for Name: SalesOrderItem; Type: TABLE DATA; Schema: public; Owner: polyflow
--

COPY public."SalesOrderItem" (id, "salesOrderId", "productVariantId", quantity, "unitPrice", subtotal, "deliveredQty", "createdAt", "updatedAt", "discountPercent", "taxAmount", "taxPercent") FROM stdin;
ec54ee05-e0ad-4e14-bd40-b8b3ecdde2c2	07ebed5c-9874-4766-b6e9-0db5440e4dd1	0c41e285-16e5-4ba1-b688-8cde225e9d21	250.0000	22500.00	5625000.00	0.0000	2026-01-21 03:03:06.186	2026-01-21 03:03:06.186	0.00	0.00	0.00
9e10f20b-3c79-4451-b7e1-ceac8c9ee0f1	07ebed5c-9874-4766-b6e9-0db5440e4dd1	e5c741e6-7652-4e66-92c1-c80587df7b86	250.0000	22500.00	5625000.00	0.0000	2026-01-21 03:03:06.186	2026-01-21 03:03:06.186	0.00	0.00	0.00
a4cfdee2-f0e3-4f0c-8915-8870230a3366	07ebed5c-9874-4766-b6e9-0db5440e4dd1	976d3eba-a011-4d35-9773-d5b4dd613551	250.0000	22500.00	5625000.00	0.0000	2026-01-21 03:03:06.186	2026-01-21 03:03:06.186	0.00	0.00	0.00
\.


--
-- Data for Name: SalesQuotation; Type: TABLE DATA; Schema: public; Owner: polyflow
--

COPY public."SalesQuotation" (id, "quotationNumber", "customerId", "quotationDate", "validUntil", status, "totalAmount", "discountAmount", "taxAmount", notes, "createdById", "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: SalesQuotationItem; Type: TABLE DATA; Schema: public; Owner: polyflow
--

COPY public."SalesQuotationItem" (id, "salesQuotationId", "productVariantId", quantity, "unitPrice", "discountPercent", "taxPercent", "taxAmount", subtotal, "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: ScrapRecord; Type: TABLE DATA; Schema: public; Owner: polyflow
--

COPY public."ScrapRecord" (id, "productionOrderId", "productVariantId", quantity, reason, "recordedAt", "createdById") FROM stdin;
\.


--
-- Data for Name: StockMovement; Type: TABLE DATA; Schema: public; Owner: polyflow
--

COPY public."StockMovement" (id, type, "productVariantId", "fromLocationId", "toLocationId", quantity, cost, reference, "createdById", "createdAt", "batchId", "salesOrderId", "goodsReceiptId") FROM stdin;
1d773bf9-8730-403d-9df9-5f410eafefac	ADJUSTMENT	68e92ebb-6fce-4483-bc9d-cc0ab1d001cb	\N	75ad437b-9b34-41e1-b427-7cb63e236247	500.0000	\N	Inital Stock	f0000eff-2dfa-4cad-8669-0243b1f9f51e	2026-01-19 02:49:19.771	\N	\N	\N
bf45c156-355d-4c8e-81b1-3374e0ed28b6	ADJUSTMENT	68e92ebb-6fce-4483-bc9d-cc0ab1d001cb	75ad437b-9b34-41e1-b427-7cb63e236247	\N	500.0000	\N	Stock Out\n	f0000eff-2dfa-4cad-8669-0243b1f9f51e	2026-01-19 02:51:27.607	\N	\N	\N
b4a8a7df-045c-440d-b30b-a2f1c3e3991e	ADJUSTMENT	b5b45f5d-55b7-4d8c-a7f7-9794bda116f9	\N	75ad437b-9b34-41e1-b427-7cb63e236247	100.0000	\N	Initial Stock Import	f0000eff-2dfa-4cad-8669-0243b1f9f51e	2026-01-19 06:29:13.151	\N	\N	\N
fe97714f-155b-4df0-85b0-0fa5d5515da0	ADJUSTMENT	68e92ebb-6fce-4483-bc9d-cc0ab1d001cb	\N	75ad437b-9b34-41e1-b427-7cb63e236247	100.0000	\N	Initial Stock Import	f0000eff-2dfa-4cad-8669-0243b1f9f51e	2026-01-19 06:29:13.17	\N	\N	\N
13da20e1-6fac-4aa6-8cf6-1577d97e34f6	ADJUSTMENT	56c57505-4059-46cf-9eea-c16dfa8e970c	\N	75ad437b-9b34-41e1-b427-7cb63e236247	100.0000	\N	Initial Stock Import	f0000eff-2dfa-4cad-8669-0243b1f9f51e	2026-01-19 06:29:13.185	\N	\N	\N
3becb527-a2c2-4510-8388-bb67834276c0	ADJUSTMENT	5fc56a9d-a649-4654-be01-40545adb299b	\N	75ad437b-9b34-41e1-b427-7cb63e236247	100.0000	\N	Initial Stock Import	f0000eff-2dfa-4cad-8669-0243b1f9f51e	2026-01-19 06:29:13.196	\N	\N	\N
3e5f2706-c330-453a-b41d-51c4c22e7bfe	ADJUSTMENT	5e18ea2a-2800-489c-a423-249d8074f019	\N	75ad437b-9b34-41e1-b427-7cb63e236247	100.0000	\N	Initial Stock Import	f0000eff-2dfa-4cad-8669-0243b1f9f51e	2026-01-19 06:29:13.206	\N	\N	\N
a13bbbed-a24e-49a0-b273-feaea4201053	ADJUSTMENT	efb73e36-20cd-456b-8a11-64069c9a6dde	\N	75ad437b-9b34-41e1-b427-7cb63e236247	100.0000	\N	Initial Stock Import	f0000eff-2dfa-4cad-8669-0243b1f9f51e	2026-01-19 06:29:13.219	\N	\N	\N
5f5cf5cd-042a-469f-ae93-c7fbc3312815	ADJUSTMENT	c94295dc-bf84-4f89-9a76-c352b90986ce	\N	75ad437b-9b34-41e1-b427-7cb63e236247	100.0000	\N	Initial Stock Import	f0000eff-2dfa-4cad-8669-0243b1f9f51e	2026-01-19 06:29:13.249	\N	\N	\N
4402a6b8-0aea-48a5-96dd-8011172d35d1	ADJUSTMENT	ba05f26d-9c26-45bf-b6e7-27f2c65a447a	\N	75ad437b-9b34-41e1-b427-7cb63e236247	100.0000	\N	Initial Stock Import	f0000eff-2dfa-4cad-8669-0243b1f9f51e	2026-01-19 06:29:13.261	\N	\N	\N
fd4d4ed5-69e7-44e3-b49b-b68956d7f0e5	ADJUSTMENT	1700703a-b14f-4677-b909-e29a1c03ec36	\N	75ad437b-9b34-41e1-b427-7cb63e236247	100.0000	\N	Initial Stock Import	f0000eff-2dfa-4cad-8669-0243b1f9f51e	2026-01-19 06:29:13.273	\N	\N	\N
df49cb62-c8a2-447c-a1b6-a29f136b132e	ADJUSTMENT	30ecde3c-b399-4359-af4f-c98bd11c5db6	\N	75ad437b-9b34-41e1-b427-7cb63e236247	100.0000	\N	Initial Stock Import	f0000eff-2dfa-4cad-8669-0243b1f9f51e	2026-01-19 06:29:13.289	\N	\N	\N
6d180050-9fbc-44fc-bc05-72ad34dae2d0	ADJUSTMENT	db9bac3b-0832-43c3-bfef-123ffe9db980	\N	75ad437b-9b34-41e1-b427-7cb63e236247	100.0000	\N	Initial Stock Import	f0000eff-2dfa-4cad-8669-0243b1f9f51e	2026-01-19 06:29:13.299	\N	\N	\N
c71e72a9-955d-4aee-94b7-f3ecf8007f3e	ADJUSTMENT	15298147-4624-4921-a762-da82ec5e19f1	\N	75ad437b-9b34-41e1-b427-7cb63e236247	100.0000	\N	Initial Stock Import	f0000eff-2dfa-4cad-8669-0243b1f9f51e	2026-01-19 06:29:13.315	\N	\N	\N
955526ab-ddce-4444-9d54-38c43987fdc2	ADJUSTMENT	c25c2770-ec37-4d87-a1d3-bf38e0117992	\N	75ad437b-9b34-41e1-b427-7cb63e236247	100.0000	\N	Initial Stock Import	f0000eff-2dfa-4cad-8669-0243b1f9f51e	2026-01-19 06:29:13.327	\N	\N	\N
52c92ed3-2ecb-4666-a76c-d755f5f483ae	ADJUSTMENT	dca00a7c-3d85-47ed-8559-da9659a102c1	\N	75ad437b-9b34-41e1-b427-7cb63e236247	100.0000	\N	Initial Stock Import	f0000eff-2dfa-4cad-8669-0243b1f9f51e	2026-01-19 06:29:13.339	\N	\N	\N
a18d513e-1a70-426a-8645-61ffca8e62c9	ADJUSTMENT	03178aa0-cda1-484c-b85c-60eb6386c606	\N	75ad437b-9b34-41e1-b427-7cb63e236247	100.0000	\N	Initial Stock Import	f0000eff-2dfa-4cad-8669-0243b1f9f51e	2026-01-19 06:29:13.352	\N	\N	\N
f12d34ea-96aa-4d93-ad55-93973164bffe	ADJUSTMENT	e9c1e73b-4fe5-4037-9385-20bab938b240	\N	75ad437b-9b34-41e1-b427-7cb63e236247	100.0000	\N	Initial Stock Import	f0000eff-2dfa-4cad-8669-0243b1f9f51e	2026-01-19 06:29:13.365	\N	\N	\N
0e6f2ebf-7cc2-49b2-b16a-475b2d490f02	ADJUSTMENT	05f32ad0-c46a-4f7e-9e1e-ad3a0967b878	\N	75ad437b-9b34-41e1-b427-7cb63e236247	100.0000	\N	Initial Stock Import	f0000eff-2dfa-4cad-8669-0243b1f9f51e	2026-01-19 06:29:13.379	\N	\N	\N
98b4ee4f-3c64-471b-ab36-fb6875b50d02	ADJUSTMENT	e4d7b713-2714-4555-8378-47741a4951af	\N	75ad437b-9b34-41e1-b427-7cb63e236247	100.0000	\N	Initial Stock Import	f0000eff-2dfa-4cad-8669-0243b1f9f51e	2026-01-19 06:29:13.393	\N	\N	\N
66fb9b2b-20a4-42c6-adca-4af7e14d0698	ADJUSTMENT	0e5d730f-9d6c-4445-b20d-b3901f8c9205	\N	75ad437b-9b34-41e1-b427-7cb63e236247	100.0000	\N	Initial Stock Import	f0000eff-2dfa-4cad-8669-0243b1f9f51e	2026-01-19 06:29:13.405	\N	\N	\N
d2961af1-892d-44ba-a4b9-fd76cc1e0ab5	ADJUSTMENT	7a5251cc-18d8-4f78-833c-afd4fdc8c9b5	\N	75ad437b-9b34-41e1-b427-7cb63e236247	100.0000	\N	Initial Stock Import	f0000eff-2dfa-4cad-8669-0243b1f9f51e	2026-01-19 06:29:13.418	\N	\N	\N
b883d9cb-6905-42de-8a6c-a0b70b4985cf	ADJUSTMENT	534c06cf-cf1f-4014-bdfc-e99820d04469	\N	75ad437b-9b34-41e1-b427-7cb63e236247	100.0000	\N	Initial Stock Import	f0000eff-2dfa-4cad-8669-0243b1f9f51e	2026-01-19 06:29:13.429	\N	\N	\N
1a7afeff-a50e-4683-842d-33ab58e7a560	ADJUSTMENT	5f44845e-fbae-4fd8-8338-5b6cad10fbd1	\N	75ad437b-9b34-41e1-b427-7cb63e236247	100.0000	\N	Initial Stock Import	f0000eff-2dfa-4cad-8669-0243b1f9f51e	2026-01-19 06:29:13.438	\N	\N	\N
ada33125-3603-4210-bfe4-23b85e1e12ab	ADJUSTMENT	94fff4c0-f8c1-4451-933c-8e6a19efc41d	\N	75ad437b-9b34-41e1-b427-7cb63e236247	100.0000	\N	Initial Stock Import	f0000eff-2dfa-4cad-8669-0243b1f9f51e	2026-01-19 06:29:13.448	\N	\N	\N
99803ac2-b1a6-43fa-a89f-931bd3350888	ADJUSTMENT	f7eb4c8c-6e14-4709-9590-1bebf0633feb	\N	75ad437b-9b34-41e1-b427-7cb63e236247	100.0000	\N	Initial Stock Import	f0000eff-2dfa-4cad-8669-0243b1f9f51e	2026-01-19 06:29:13.46	\N	\N	\N
87bc8745-96b7-45e6-b834-f0af46f66e3e	ADJUSTMENT	16ff1042-ff62-463e-a352-c0dd5cfcdc7c	\N	75ad437b-9b34-41e1-b427-7cb63e236247	100.0000	\N	Initial Stock Import	f0000eff-2dfa-4cad-8669-0243b1f9f51e	2026-01-19 06:29:13.474	\N	\N	\N
a2592f30-37d1-4f92-bd8b-ccd37e450dea	ADJUSTMENT	4b88c5d3-24ea-45c3-90db-c19715eb600e	\N	75ad437b-9b34-41e1-b427-7cb63e236247	100.0000	\N	Initial Stock Import	f0000eff-2dfa-4cad-8669-0243b1f9f51e	2026-01-19 06:29:13.488	\N	\N	\N
56094f72-bc94-47b8-a236-5384d2f98dd6	ADJUSTMENT	b1df47f8-bb81-4eef-92b1-257cc70a8c52	\N	75ad437b-9b34-41e1-b427-7cb63e236247	100.0000	\N	Initial Stock Import	f0000eff-2dfa-4cad-8669-0243b1f9f51e	2026-01-19 06:29:13.501	\N	\N	\N
dec09329-5978-4284-a626-ebbbb57dc72a	ADJUSTMENT	b5b45f5d-55b7-4d8c-a7f7-9794bda116f9	75ad437b-9b34-41e1-b427-7cb63e236247	\N	9.0000	\N	Initial Stock	f0000eff-2dfa-4cad-8669-0243b1f9f51e	2026-01-19 06:31:48.197	\N	\N	\N
2221d4b2-ba4e-43ec-bfab-e5bceb62e6b1	ADJUSTMENT	b5b45f5d-55b7-4d8c-a7f7-9794bda116f9	75ad437b-9b34-41e1-b427-7cb63e236247	\N	82.0000	\N	Initial Stock	f0000eff-2dfa-4cad-8669-0243b1f9f51e	2026-01-19 06:32:34.932	\N	\N	\N
02072977-30e9-4c5f-8382-912bc6052e9f	ADJUSTMENT	68e92ebb-6fce-4483-bc9d-cc0ab1d001cb	\N	75ad437b-9b34-41e1-b427-7cb63e236247	1445.0000	\N	Inital Stock	f0000eff-2dfa-4cad-8669-0243b1f9f51e	2026-01-19 06:33:05.449	\N	\N	\N
09333c9a-b82a-4972-908d-37f0f7409aee	ADJUSTMENT	56c57505-4059-46cf-9eea-c16dfa8e970c	\N	75ad437b-9b34-41e1-b427-7cb63e236247	5.0000	\N	Initial Stock	f0000eff-2dfa-4cad-8669-0243b1f9f51e	2026-01-19 06:33:34.902	\N	\N	\N
c88a7721-6e0e-4587-a336-19a59548e081	ADJUSTMENT	5fc56a9d-a649-4654-be01-40545adb299b	\N	75ad437b-9b34-41e1-b427-7cb63e236247	1882.0000	\N	Initial Stock\n	f0000eff-2dfa-4cad-8669-0243b1f9f51e	2026-01-19 06:34:23.268	\N	\N	\N
9afc42f5-552d-4117-bda5-a79a870be515	ADJUSTMENT	5e18ea2a-2800-489c-a423-249d8074f019	\N	75ad437b-9b34-41e1-b427-7cb63e236247	64.0000	\N	Initial Stock	f0000eff-2dfa-4cad-8669-0243b1f9f51e	2026-01-19 06:34:43.751	\N	\N	\N
076c012b-3bde-423c-b6d2-ced492005677	ADJUSTMENT	efb73e36-20cd-456b-8a11-64069c9a6dde	\N	75ad437b-9b34-41e1-b427-7cb63e236247	500.0000	\N	Initial Stock	f0000eff-2dfa-4cad-8669-0243b1f9f51e	2026-01-19 06:36:00.467	\N	\N	\N
4eddd106-0743-41ec-ac01-63d17925423a	ADJUSTMENT	c94295dc-bf84-4f89-9a76-c352b90986ce	\N	75ad437b-9b34-41e1-b427-7cb63e236247	900.0000	\N	Initial Stock	f0000eff-2dfa-4cad-8669-0243b1f9f51e	2026-01-19 06:36:21.325	\N	\N	\N
09220667-10a2-49be-8de6-a223eaa900e2	ADJUSTMENT	ba05f26d-9c26-45bf-b6e7-27f2c65a447a	\N	75ad437b-9b34-41e1-b427-7cb63e236247	395.0000	\N	Initial Stock	f0000eff-2dfa-4cad-8669-0243b1f9f51e	2026-01-19 06:36:44.043	\N	\N	\N
ab1d891f-f1ac-40b1-a905-e4488749bdf7	ADJUSTMENT	1700703a-b14f-4677-b909-e29a1c03ec36	\N	75ad437b-9b34-41e1-b427-7cb63e236247	296.0000	\N	Initial Stock	f0000eff-2dfa-4cad-8669-0243b1f9f51e	2026-01-19 06:37:08.132	\N	\N	\N
c17d4f60-2bfc-4d80-8dcb-5e513dcd63b1	ADJUSTMENT	68e92ebb-6fce-4483-bc9d-cc0ab1d001cb	75ad437b-9b34-41e1-b427-7cb63e236247	\N	100.0000	\N	Stock Revisi	f0000eff-2dfa-4cad-8669-0243b1f9f51e	2026-01-19 06:38:39.697	\N	\N	\N
de7c679b-4d23-4008-9137-4a024e64cc20	ADJUSTMENT	56c57505-4059-46cf-9eea-c16dfa8e970c	75ad437b-9b34-41e1-b427-7cb63e236247	\N	100.0000	\N	Stock Adjustment	f0000eff-2dfa-4cad-8669-0243b1f9f51e	2026-01-19 06:39:44.291	\N	\N	\N
879a34e4-c598-4e2f-a393-3a556c67dec7	ADJUSTMENT	5fc56a9d-a649-4654-be01-40545adb299b	75ad437b-9b34-41e1-b427-7cb63e236247	\N	100.0000	\N	Stock Adjustment	f0000eff-2dfa-4cad-8669-0243b1f9f51e	2026-01-19 06:40:01.758	\N	\N	\N
361c1892-9b49-46d1-b3b4-4231c062aa6e	ADJUSTMENT	5e18ea2a-2800-489c-a423-249d8074f019	75ad437b-9b34-41e1-b427-7cb63e236247	\N	100.0000	\N	Stock Adjustment	f0000eff-2dfa-4cad-8669-0243b1f9f51e	2026-01-19 06:40:13.204	\N	\N	\N
2b7d549b-3822-437d-b6f5-4149efa479bd	ADJUSTMENT	efb73e36-20cd-456b-8a11-64069c9a6dde	75ad437b-9b34-41e1-b427-7cb63e236247	\N	100.0000	\N	Stock Adjustment	f0000eff-2dfa-4cad-8669-0243b1f9f51e	2026-01-19 06:40:31.207	\N	\N	\N
eea84740-abce-435d-911a-d55d5ad81708	ADJUSTMENT	c94295dc-bf84-4f89-9a76-c352b90986ce	75ad437b-9b34-41e1-b427-7cb63e236247	\N	100.0000	\N	Stock Adjustment	f0000eff-2dfa-4cad-8669-0243b1f9f51e	2026-01-19 06:40:45.524	\N	\N	\N
c2a60131-3c54-4253-a331-c9acb848d3ce	ADJUSTMENT	ba05f26d-9c26-45bf-b6e7-27f2c65a447a	75ad437b-9b34-41e1-b427-7cb63e236247	\N	100.0000	\N	Initial Stock	f0000eff-2dfa-4cad-8669-0243b1f9f51e	2026-01-19 06:41:30.913	\N	\N	\N
d0d84c3b-8ef7-4292-9c24-47ea06d62ed2	ADJUSTMENT	1700703a-b14f-4677-b909-e29a1c03ec36	75ad437b-9b34-41e1-b427-7cb63e236247	\N	100.0000	\N	Stock Adjustment	f0000eff-2dfa-4cad-8669-0243b1f9f51e	2026-01-19 06:41:48.734	\N	\N	\N
0a7075d1-9ef6-4e4a-8aa1-2ca70be6bb8b	ADJUSTMENT	30ecde3c-b399-4359-af4f-c98bd11c5db6	\N	75ad437b-9b34-41e1-b427-7cb63e236247	1270.0000	\N	Initial Stock	f0000eff-2dfa-4cad-8669-0243b1f9f51e	2026-01-19 06:42:17.567	\N	\N	\N
a1d64757-cf69-4886-82c1-3796d26babea	ADJUSTMENT	db9bac3b-0832-43c3-bfef-123ffe9db980	\N	75ad437b-9b34-41e1-b427-7cb63e236247	1270.0000	\N	Initial Stock	f0000eff-2dfa-4cad-8669-0243b1f9f51e	2026-01-19 06:42:40.847	\N	\N	\N
df5323da-6246-480e-a45c-cafc2d8baa70	ADJUSTMENT	db9bac3b-0832-43c3-bfef-123ffe9db980	75ad437b-9b34-41e1-b427-7cb63e236247	\N	551.0000	\N	Stock Adjustment	f0000eff-2dfa-4cad-8669-0243b1f9f51e	2026-01-19 07:01:36.606	\N	\N	\N
e3702fec-2799-483b-b521-8e60f19cf78b	ADJUSTMENT	15298147-4624-4921-a762-da82ec5e19f1	\N	75ad437b-9b34-41e1-b427-7cb63e236247	175.0000	\N	Inital Stock	f0000eff-2dfa-4cad-8669-0243b1f9f51e	2026-01-19 07:02:04.345	\N	\N	\N
3d067b31-dfd7-48a4-a2b3-845d24f874b8	ADJUSTMENT	c25c2770-ec37-4d87-a1d3-bf38e0117992	75ad437b-9b34-41e1-b427-7cb63e236247	\N	75.0000	\N	Stock Adjustment	f0000eff-2dfa-4cad-8669-0243b1f9f51e	2026-01-19 07:03:26.563	\N	\N	\N
8798bfeb-6a25-4166-b627-a7a8a697e66c	ADJUSTMENT	dca00a7c-3d85-47ed-8559-da9659a102c1	\N	75ad437b-9b34-41e1-b427-7cb63e236247	894.0000	\N	Initial Stock	f0000eff-2dfa-4cad-8669-0243b1f9f51e	2026-01-19 07:07:04.453	\N	\N	\N
8d7cbee9-b281-4f85-923c-e85e0e00fb6d	ADJUSTMENT	03178aa0-cda1-484c-b85c-60eb6386c606	75ad437b-9b34-41e1-b427-7cb63e236247	\N	100.0000	\N	Stock Adjustment	f0000eff-2dfa-4cad-8669-0243b1f9f51e	2026-01-19 07:07:21.518	\N	\N	\N
194f6181-673e-48ac-a101-2c0feb18a481	ADJUSTMENT	68e92ebb-6fce-4483-bc9d-cc0ab1d001cb	\N	75ad437b-9b34-41e1-b427-7cb63e236247	375.0000	\N	From Duta Baru	f0000eff-2dfa-4cad-8669-0243b1f9f51e	2026-01-19 07:07:40.936	\N	\N	\N
869a2888-dcbf-4e82-99a2-0ee36d4712b2	ADJUSTMENT	e9c1e73b-4fe5-4037-9385-20bab938b240	\N	75ad437b-9b34-41e1-b427-7cb63e236247	850.0000	\N	Initial Stock	f0000eff-2dfa-4cad-8669-0243b1f9f51e	2026-01-19 07:08:06.728	\N	\N	\N
9ae4284a-2bc6-487a-ac41-2eb337856444	ADJUSTMENT	05f32ad0-c46a-4f7e-9e1e-ad3a0967b878	75ad437b-9b34-41e1-b427-7cb63e236247	\N	86.0000	\N	Stock Adjustment	f0000eff-2dfa-4cad-8669-0243b1f9f51e	2026-01-19 07:08:55.54	\N	\N	\N
598fc91a-2743-4c5c-a79b-f0d14ab56b9d	ADJUSTMENT	0e5d730f-9d6c-4445-b20d-b3901f8c9205	\N	75ad437b-9b34-41e1-b427-7cb63e236247	356.0000	\N	Initial Stock	f0000eff-2dfa-4cad-8669-0243b1f9f51e	2026-01-19 07:09:33.355	\N	\N	\N
31b5d350-307f-413b-95bc-2e210bf69646	ADJUSTMENT	e4d7b713-2714-4555-8378-47741a4951af	\N	75ad437b-9b34-41e1-b427-7cb63e236247	175.0000	\N	Initial Stock\n	f0000eff-2dfa-4cad-8669-0243b1f9f51e	2026-01-19 07:10:05.328	\N	\N	\N
248a16eb-de7e-46c1-b1be-6283effd4289	ADJUSTMENT	7a5251cc-18d8-4f78-833c-afd4fdc8c9b5	\N	75ad437b-9b34-41e1-b427-7cb63e236247	25.0000	\N	Initial Stock\n	f0000eff-2dfa-4cad-8669-0243b1f9f51e	2026-01-19 07:10:35.686	\N	\N	\N
5c884502-8514-48a2-a54d-40d2d65dc1ea	ADJUSTMENT	534c06cf-cf1f-4014-bdfc-e99820d04469	\N	75ad437b-9b34-41e1-b427-7cb63e236247	75.0000	\N	Initial Stock	f0000eff-2dfa-4cad-8669-0243b1f9f51e	2026-01-19 07:11:03.359	\N	\N	\N
21f7ced0-7387-464b-acf6-27d95933ff6e	ADJUSTMENT	5f44845e-fbae-4fd8-8338-5b6cad10fbd1	\N	75ad437b-9b34-41e1-b427-7cb63e236247	75.0000	\N	Initial Stock	f0000eff-2dfa-4cad-8669-0243b1f9f51e	2026-01-19 07:11:26.366	\N	\N	\N
71582835-a1c9-48db-914d-7b68565c7231	ADJUSTMENT	94fff4c0-f8c1-4451-933c-8e6a19efc41d	\N	75ad437b-9b34-41e1-b427-7cb63e236247	250.0000	\N	Initial Stock	f0000eff-2dfa-4cad-8669-0243b1f9f51e	2026-01-19 07:12:16.967	\N	\N	\N
2c2b1110-a9ca-4e6b-877c-d2c14bd7829a	ADJUSTMENT	f7eb4c8c-6e14-4709-9590-1bebf0633feb	75ad437b-9b34-41e1-b427-7cb63e236247	\N	100.0000	\N	Initial Stock	f0000eff-2dfa-4cad-8669-0243b1f9f51e	2026-01-19 07:12:41.042	\N	\N	\N
ad68ea81-5ab9-4e66-806b-bdaafe0162ed	ADJUSTMENT	4b88c5d3-24ea-45c3-90db-c19715eb600e	75ad437b-9b34-41e1-b427-7cb63e236247	\N	70.0000	\N	Initial Stock	f0000eff-2dfa-4cad-8669-0243b1f9f51e	2026-01-19 07:13:07.167	\N	\N	\N
79750a82-f6b1-4c7e-973a-f72c83008537	ADJUSTMENT	65baaa0c-defe-4c8d-87bf-9b2ab2a0874a	\N	0452f60e-9518-4a8b-ad5b-5e6d46297c4a	110.0000	\N	Initial stock	f0000eff-2dfa-4cad-8669-0243b1f9f51e	2026-01-19 07:14:23.937	\N	\N	\N
f12c1609-838e-47bd-a022-f3a44f0da283	ADJUSTMENT	ce7f996e-3a3b-4d93-bbb1-52c818f9e779	\N	0452f60e-9518-4a8b-ad5b-5e6d46297c4a	339.0000	\N	Initial Stock	f0000eff-2dfa-4cad-8669-0243b1f9f51e	2026-01-19 07:15:01.331	\N	\N	\N
b2c8896f-66ea-4547-84d4-a6d42c1d3f16	ADJUSTMENT	9dda0cd7-31bb-469e-8891-fe88c5e01d33	\N	0452f60e-9518-4a8b-ad5b-5e6d46297c4a	561.0000	\N	Initial Stock	f0000eff-2dfa-4cad-8669-0243b1f9f51e	2026-01-19 07:15:28.879	\N	\N	\N
2c60a9e6-8454-41ec-8257-463671dcaad0	ADJUSTMENT	c325b4c0-73d7-4aff-b9bf-52d72bbda84c	\N	0452f60e-9518-4a8b-ad5b-5e6d46297c4a	562.0000	\N	Initial Stock	f0000eff-2dfa-4cad-8669-0243b1f9f51e	2026-01-19 07:16:26.301	\N	\N	\N
ccd6103a-cbb7-4df7-86dc-8f3d0d362192	ADJUSTMENT	0c41e285-16e5-4ba1-b688-8cde225e9d21	\N	0452f60e-9518-4a8b-ad5b-5e6d46297c4a	358.0000	\N	Initial Stock	f0000eff-2dfa-4cad-8669-0243b1f9f51e	2026-01-19 08:42:13.459	\N	\N	\N
f56e2667-c44d-4d45-9b21-dedbd2b3f42b	ADJUSTMENT	e5c741e6-7652-4e66-92c1-c80587df7b86	\N	0452f60e-9518-4a8b-ad5b-5e6d46297c4a	400.0000	\N	Initial Stock	f0000eff-2dfa-4cad-8669-0243b1f9f51e	2026-01-19 08:42:37.367	\N	\N	\N
0787fa86-70ad-4168-937b-f701f695ac2f	ADJUSTMENT	976d3eba-a011-4d35-9773-d5b4dd613551	\N	0452f60e-9518-4a8b-ad5b-5e6d46297c4a	110.0000	\N	Initial Stock	f0000eff-2dfa-4cad-8669-0243b1f9f51e	2026-01-19 08:44:28.3	\N	\N	\N
07879e48-20ba-4370-a2c3-6eef1074a6b0	ADJUSTMENT	976d3eba-a011-4d35-9773-d5b4dd613551	\N	0452f60e-9518-4a8b-ad5b-5e6d46297c4a	165.0000	\N	Stock Adjustment	f0000eff-2dfa-4cad-8669-0243b1f9f51e	2026-01-19 08:44:51.069	\N	\N	\N
e801cf38-0df8-4eb3-8611-52d475743563	ADJUSTMENT	67afcf50-f8a2-4dea-ad11-733acc19682f	\N	0452f60e-9518-4a8b-ad5b-5e6d46297c4a	1155.0000	\N	Initial Stock	f0000eff-2dfa-4cad-8669-0243b1f9f51e	2026-01-19 08:46:41.622	\N	\N	\N
bb5aea4f-fdab-4096-8dbe-1b69d65b3181	ADJUSTMENT	0fc1f30b-43d3-4f84-8876-5402bc8c5e65	\N	0452f60e-9518-4a8b-ad5b-5e6d46297c4a	588.0000	\N	Initial Stock	f0000eff-2dfa-4cad-8669-0243b1f9f51e	2026-01-19 08:48:14.157	\N	\N	\N
1bd6bd02-1718-4fa1-b0f7-218328405498	ADJUSTMENT	0da6d9f3-6a7c-492f-a204-d82b86a36b5f	\N	0452f60e-9518-4a8b-ad5b-5e6d46297c4a	381.0000	\N	Initial Stock	f0000eff-2dfa-4cad-8669-0243b1f9f51e	2026-01-19 08:48:34.59	\N	\N	\N
772aa8b3-1309-4449-be61-acc88784b1dd	ADJUSTMENT	53d5fd3f-f333-4961-b244-6d7220b29d1d	\N	0452f60e-9518-4a8b-ad5b-5e6d46297c4a	479.0000	\N	Initial Stock	f0000eff-2dfa-4cad-8669-0243b1f9f51e	2026-01-19 08:48:55.141	\N	\N	\N
a2709ea0-32f9-46de-868e-f3cb741137c1	ADJUSTMENT	b903b729-2e91-44ee-b83c-b3c5554e49a0	\N	0452f60e-9518-4a8b-ad5b-5e6d46297c4a	166.0000	\N	Initial Stock	f0000eff-2dfa-4cad-8669-0243b1f9f51e	2026-01-19 08:49:25.835	\N	\N	\N
b2b265f2-4096-45e4-9cf5-8d79b0093855	ADJUSTMENT	dd7a7330-3851-4747-bdec-46d339148e9f	\N	0452f60e-9518-4a8b-ad5b-5e6d46297c4a	324.0000	\N	Initial Stock	f0000eff-2dfa-4cad-8669-0243b1f9f51e	2026-01-19 08:49:55.467	\N	\N	\N
9ed2f8a8-6094-45be-9d67-1a9142524d3f	ADJUSTMENT	41c20290-7fe7-46da-afb9-8bfe11077d05	\N	0452f60e-9518-4a8b-ad5b-5e6d46297c4a	543.0000	\N	Initial Stock	f0000eff-2dfa-4cad-8669-0243b1f9f51e	2026-01-19 08:50:23.916	\N	\N	\N
68370a17-40ac-4e07-ad5c-89e4291476e8	ADJUSTMENT	c07a7d2d-a068-4f33-adac-00af64ce08d3	\N	0452f60e-9518-4a8b-ad5b-5e6d46297c4a	54.0000	\N	Initial Stock	f0000eff-2dfa-4cad-8669-0243b1f9f51e	2026-01-19 08:51:10.597	\N	\N	\N
828027ef-c8bb-4937-89f1-a7c7da925528	ADJUSTMENT	510fe8a8-1a9f-4439-bdd2-7ed9a4dddd1a	\N	0452f60e-9518-4a8b-ad5b-5e6d46297c4a	57.0000	\N	Initial Stock	f0000eff-2dfa-4cad-8669-0243b1f9f51e	2026-01-19 08:52:26.746	\N	\N	\N
74509bab-6e68-4c2d-b647-5317ea11400e	ADJUSTMENT	48c41b36-7cad-49d6-9f2c-94e7bce32725	\N	0452f60e-9518-4a8b-ad5b-5e6d46297c4a	60.0000	\N	Initial Stock	f0000eff-2dfa-4cad-8669-0243b1f9f51e	2026-01-19 08:52:49.46	\N	\N	\N
a09dd5e8-3033-47ea-bac7-efec882f5669	ADJUSTMENT	c35a2345-0a2c-471f-a6e8-32e0589c1576	\N	0452f60e-9518-4a8b-ad5b-5e6d46297c4a	43.0000	\N	Initial Stock	f0000eff-2dfa-4cad-8669-0243b1f9f51e	2026-01-19 08:53:31.548	\N	\N	\N
3a02d7df-036d-415a-93af-a5a47d592060	ADJUSTMENT	e61096c6-92b5-4b46-b828-3a2a25bf6fb6	\N	0452f60e-9518-4a8b-ad5b-5e6d46297c4a	220.0000	\N	Initial Stock	f0000eff-2dfa-4cad-8669-0243b1f9f51e	2026-01-19 08:53:59.445	\N	\N	\N
85d6e554-72f4-4b00-9c77-eb1159f61e9e	ADJUSTMENT	979d2b8f-b2c6-4a97-b578-ac58daa29d36	\N	0452f60e-9518-4a8b-ad5b-5e6d46297c4a	303.0000	\N	Initial Stock	f0000eff-2dfa-4cad-8669-0243b1f9f51e	2026-01-19 08:56:37.492	\N	\N	\N
3c4df113-bb91-44b7-af0d-1ad21e8455d4	ADJUSTMENT	68e92ebb-6fce-4483-bc9d-cc0ab1d001cb	\N	75ad437b-9b34-41e1-b427-7cb63e236247	375.0000	3750000.0000	Pelled From Duta Baru	f0000eff-2dfa-4cad-8669-0243b1f9f51e	2026-01-21 01:40:30.347	\N	\N	\N
e00b5733-8dca-4e94-ac0f-a80393fe270d	ADJUSTMENT	68e92ebb-6fce-4483-bc9d-cc0ab1d001cb	75ad437b-9b34-41e1-b427-7cb63e236247	\N	375.0000	\N	Stock Adjustment	a8971ec0-a686-43b0-aec0-53d383321331	2026-01-21 01:43:26.303	\N	\N	\N
c9251b89-beec-45f8-8db8-59509f808f7f	PURCHASE	68e92ebb-6fce-4483-bc9d-cc0ab1d001cb	\N	75ad437b-9b34-41e1-b427-7cb63e236247	375.0000	12000.0000	GR: GR-2026-0001 for PO	a8971ec0-a686-43b0-aec0-53d383321331	2026-01-21 01:45:18.598	\N	\N	492e9f1b-c4d1-4407-b3ef-d3ce9e28b534
7e966e96-2eb8-4f1a-a844-edde9a5924f4	PURCHASE	dca00a7c-3d85-47ed-8559-da9659a102c1	\N	75ad437b-9b34-41e1-b427-7cb63e236247	650.0000	10000.0000	GR: GR-2026-0002 for PO	f0000eff-2dfa-4cad-8669-0243b1f9f51e	2026-01-21 02:19:14.509	\N	\N	0200ae89-00fa-4631-94f9-1cf36829b012
ac9dfbaf-efbf-47d8-b21f-a588d4d3bdaf	ADJUSTMENT	dca00a7c-3d85-47ed-8559-da9659a102c1	75ad437b-9b34-41e1-b427-7cb63e236247	\N	1070.0000	\N	Initial Stock	f0000eff-2dfa-4cad-8669-0243b1f9f51e	2026-01-21 02:24:50.367	\N	\N	\N
71df2eb8-d669-4325-8927-191f5708be17	IN	0635d93b-ffbe-403d-8a05-bb2835cf4d73	\N	0c882912-ebec-44e4-8431-bae328a11436	549.0000	\N	Production Partial Output: PO-PO-260121-MIX25	\N	2026-01-21 02:49:40.543	\N	\N	\N
123e2946-b95f-430f-9277-8d596de3cf20	OUT	5fc56a9d-a649-4654-be01-40545adb299b	0c882912-ebec-44e4-8431-bae328a11436	\N	250.0000	\N	Backflush (Partial): PO-PO-260121-MIX25	\N	2026-01-21 02:49:40.554	\N	\N	\N
d8d0f169-7558-4091-a42e-56c12c465373	OUT	c94295dc-bf84-4f89-9a76-c352b90986ce	0c882912-ebec-44e4-8431-bae328a11436	\N	100.0000	\N	Backflush (Partial): PO-PO-260121-MIX25	\N	2026-01-21 02:49:40.563	\N	\N	\N
612138ae-82e8-449e-9f22-5dd7943aa13b	OUT	94fff4c0-f8c1-4451-933c-8e6a19efc41d	0c882912-ebec-44e4-8431-bae328a11436	\N	25.0000	\N	Backflush (Partial): PO-PO-260121-MIX25	\N	2026-01-21 02:49:40.571	\N	\N	\N
a39ae454-867e-4342-9608-ad27499f2d15	OUT	dca00a7c-3d85-47ed-8559-da9659a102c1	0c882912-ebec-44e4-8431-bae328a11436	\N	50.0000	\N	Backflush (Partial): PO-PO-260121-MIX25	\N	2026-01-21 02:49:40.579	\N	\N	\N
9960442f-f176-4ee6-92b6-81b8002d3276	OUT	68e92ebb-6fce-4483-bc9d-cc0ab1d001cb	0c882912-ebec-44e4-8431-bae328a11436	\N	75.0000	\N	Backflush (Partial): PO-PO-260121-MIX25	\N	2026-01-21 02:49:40.587	\N	\N	\N
4ef864e5-e6e9-4e1b-b77f-f28f7e7ce36c	OUT	15298147-4624-4921-a762-da82ec5e19f1	0c882912-ebec-44e4-8431-bae328a11436	\N	7.5000	\N	Backflush (Partial): PO-PO-260121-MIX25	\N	2026-01-21 02:49:40.594	\N	\N	\N
2d49e95d-1605-4f1a-97e0-ab399169f596	OUT	30ecde3c-b399-4359-af4f-c98bd11c5db6	0c882912-ebec-44e4-8431-bae328a11436	\N	7.5000	\N	Backflush (Partial): PO-PO-260121-MIX25	\N	2026-01-21 02:49:40.601	\N	\N	\N
c8526983-b6a5-4694-9758-ff163d0875fe	OUT	db9bac3b-0832-43c3-bfef-123ffe9db980	0c882912-ebec-44e4-8431-bae328a11436	\N	12.5000	\N	Backflush (Partial): PO-PO-260121-MIX25	\N	2026-01-21 02:49:40.607	\N	\N	\N
3e75a6a7-aa82-4fad-bde0-709219cf4d29	OUT	4b88c5d3-24ea-45c3-90db-c19715eb600e	0c882912-ebec-44e4-8431-bae328a11436	\N	4.0000	\N	Backflush (Partial): PO-PO-260121-MIX25	\N	2026-01-21 02:49:40.615	\N	\N	\N
0552b0d6-193e-4cd1-8ad0-c7b5f98671f4	OUT	16ff1042-ff62-463e-a352-c0dd5cfcdc7c	0c882912-ebec-44e4-8431-bae328a11436	\N	17.5000	\N	Backflush (Partial): PO-PO-260121-MIX25	\N	2026-01-21 02:49:40.622	\N	\N	\N
cbb452db-7ebb-40e5-a8ae-872819a245ab	OUT	0c41e285-16e5-4ba1-b688-8cde225e9d21	0452f60e-9518-4a8b-ad5b-5e6d46297c4a	\N	250.0000	\N	Shipment for SO-2026-0001	f0000eff-2dfa-4cad-8669-0243b1f9f51e	2026-01-21 03:03:32.91	\N	07ebed5c-9874-4766-b6e9-0db5440e4dd1	\N
5722058a-f01a-4fc0-87b8-1fbe9ce46239	OUT	e5c741e6-7652-4e66-92c1-c80587df7b86	0452f60e-9518-4a8b-ad5b-5e6d46297c4a	\N	250.0000	\N	Shipment for SO-2026-0001	f0000eff-2dfa-4cad-8669-0243b1f9f51e	2026-01-21 03:03:32.922	\N	07ebed5c-9874-4766-b6e9-0db5440e4dd1	\N
2a6edbb0-be81-4ea2-9bc6-3087aa2a7dfc	OUT	976d3eba-a011-4d35-9773-d5b4dd613551	0452f60e-9518-4a8b-ad5b-5e6d46297c4a	\N	250.0000	\N	Shipment for SO-2026-0001	f0000eff-2dfa-4cad-8669-0243b1f9f51e	2026-01-21 03:03:32.935	\N	07ebed5c-9874-4766-b6e9-0db5440e4dd1	\N
33aa2c35-5de2-4b22-b3cd-14d5fac5afb3	OUT	68e92ebb-6fce-4483-bc9d-cc0ab1d001cb	75ad437b-9b34-41e1-b427-7cb63e236247	\N	25.0000	\N	PROD-ISSUE-3787262c	\N	2026-01-21 03:45:30.99	\N	\N	\N
2f73c6c0-d33a-4731-bd95-95153391a6f4	OUT	5fc56a9d-a649-4654-be01-40545adb299b	75ad437b-9b34-41e1-b427-7cb63e236247	\N	15.0000	\N	PROD-ISSUE-3787262c	\N	2026-01-21 03:45:31.005	\N	\N	\N
1e514cc9-fc47-4f52-a4d4-4329d4a60742	OUT	dca00a7c-3d85-47ed-8559-da9659a102c1	75ad437b-9b34-41e1-b427-7cb63e236247	\N	35.0000	\N	PROD-ISSUE-3787262c	\N	2026-01-21 03:45:31.015	\N	\N	\N
41b351f3-e6be-4f42-951d-9c885a0853b0	OUT	db9bac3b-0832-43c3-bfef-123ffe9db980	75ad437b-9b34-41e1-b427-7cb63e236247	\N	2.5000	\N	PROD-ISSUE-3787262c	\N	2026-01-21 03:45:31.026	\N	\N	\N
4b67c5f9-a8cc-4118-a06d-7ce0064f1b0f	OUT	15298147-4624-4921-a762-da82ec5e19f1	75ad437b-9b34-41e1-b427-7cb63e236247	\N	1.2500	\N	PROD-ISSUE-3787262c	\N	2026-01-21 03:45:31.036	\N	\N	\N
2f602742-9d14-455a-bd87-80a71eb37316	OUT	30ecde3c-b399-4359-af4f-c98bd11c5db6	75ad437b-9b34-41e1-b427-7cb63e236247	\N	1.2500	\N	PROD-ISSUE-3787262c	\N	2026-01-21 03:45:31.049	\N	\N	\N
ae17f09f-f7e4-4e83-aaa8-fba711168747	OUT	c94295dc-bf84-4f89-9a76-c352b90986ce	75ad437b-9b34-41e1-b427-7cb63e236247	\N	20.0000	\N	PROD-ISSUE-3787262c	\N	2026-01-21 03:45:31.058	\N	\N	\N
4aafa5c7-ba7a-45f4-9a11-480542686beb	OUT	16ff1042-ff62-463e-a352-c0dd5cfcdc7c	75ad437b-9b34-41e1-b427-7cb63e236247	\N	3.5000	\N	PROD-ISSUE-3787262c	\N	2026-01-21 03:45:31.073	\N	\N	\N
3f7f90bd-3108-43c3-8caa-06878b071419	OUT	4b88c5d3-24ea-45c3-90db-c19715eb600e	75ad437b-9b34-41e1-b427-7cb63e236247	\N	0.8000	\N	PROD-ISSUE-3787262c	\N	2026-01-21 03:45:31.087	\N	\N	\N
\.


--
-- Data for Name: StockOpname; Type: TABLE DATA; Schema: public; Owner: polyflow
--

COPY public."StockOpname" (id, "locationId", status, remarks, "createdById", "createdAt", "completedAt", "updatedAt") FROM stdin;
2adb7333-1b05-4844-a3c2-5a40aed34842	75ad437b-9b34-41e1-b427-7cb63e236247	OPEN	Stock Pertama	\N	2026-01-19 02:45:17.912	\N	2026-01-19 02:45:17.912
\.


--
-- Data for Name: StockOpnameItem; Type: TABLE DATA; Schema: public; Owner: polyflow
--

COPY public."StockOpnameItem" (id, "opnameId", "productVariantId", "systemQuantity", "countedQuantity", notes) FROM stdin;
\.


--
-- Data for Name: StockReservation; Type: TABLE DATA; Schema: public; Owner: polyflow
--

COPY public."StockReservation" (id, "productVariantId", "locationId", quantity, "reservedFor", "referenceId", "reservedUntil", status, "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: Supplier; Type: TABLE DATA; Schema: public; Owner: polyflow
--

COPY public."Supplier" (id, name, code, phone, email, address, "taxId", "paymentTermDays", "bankName", "bankAccount", notes, "isActive", "createdAt", "updatedAt") FROM stdin;
7bdc29b5-082a-4eac-9b5b-aa4f7cd8546b	Default Supplier	SUP-DEFAULT	0000000000	\N	—	\N	\N	\N	\N	\N	t	2026-01-17 13:23:07.172	2026-01-17 13:23:07.172
f3758a59-9e97-4ef4-b9ca-86469a8ac62a	CV. Duta Baru Plasindo	SUP-001	088221333598		Polokarto, Sukoharjo		0			Pelled Affal	t	2026-01-21 01:48:27.74	2026-01-21 01:48:27.74
c7ddcd93-2a33-4285-a561-18f0d7c9f953	Bhima Raya Chemical	SUP-002	081393574789		Solobaru, Sukoharjo		0				t	2026-01-21 01:49:45.894	2026-01-21 01:49:45.894
a5e40c11-3ee7-4899-b0e1-2c967ab94bba	Cipta Surya Plastindo	SUP-003	082220345757		Surabaya, Jawa Timur		0				t	2026-01-21 01:51:31.225	2026-01-21 01:51:31.225
c9b7eac9-24c4-4e5f-8aeb-30848c042368	Lautan Sakti	SUP-004	085100012036		Solobaru, Sukoharjo		0				t	2026-01-21 01:52:09.619	2026-01-21 01:52:09.619
7acfb713-29a9-49b9-a52b-7b4117fa4fef	Intera Lestari Polimer	SUP-007	085943330720		Semarang		0				t	2026-01-21 02:00:29.043	2026-01-21 02:00:29.043
6acbd903-5755-4822-9682-fdbaa22171a4	MUYOSA (Marsono)	SUP-006	081391999903		Dagen, Jaten		0				t	2026-01-21 01:58:12.88	2026-01-21 02:06:13.514
02fce75d-0c19-417c-8bb5-af5d59a02bbe	Pancabudi	SUP-005			Tangerang, Banten		0				t	2026-01-21 01:55:20.649	2026-01-21 02:06:33.949
033d1f3f-9e37-4421-b818-6a0e4052c97a	CV. Sumbermas Jaya Plastindo	SUP-009			Telukan, Grogol, Sukoharjo		0				t	2026-01-21 03:00:06.587	2026-01-21 03:00:06.587
56909ed9-7f9d-4068-9e37-1f6e62a3f183	Setiyo Raharjo	SUP-008			Mojosongo, Surakarta		0				t	2026-01-21 02:05:42.042	2026-01-21 03:00:40.105
\.


--
-- Data for Name: SupplierProduct; Type: TABLE DATA; Schema: public; Owner: polyflow
--

COPY public."SupplierProduct" (id, "supplierId", "productVariantId", "unitPrice", "leadTimeDays", "minOrderQty", "isPreferred", notes, "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: User; Type: TABLE DATA; Schema: public; Owner: polyflow
--

COPY public."User" (id, email, name, password, role, "createdAt", "updatedAt") FROM stdin;
a8971ec0-a686-43b0-aec0-53d383321331	admin@polyflow.com	Admin PolyFlow	$2b$10$1TAWXOzHiTqlZQp6RdqQAONldCEoq0UcPuv8wk1N63juj0cmvPGoq	ADMIN	2026-01-17 13:59:01.338	2026-01-17 13:59:01.338
f0000eff-2dfa-4cad-8669-0243b1f9f51e	rizal@melindo.com	Rizal	$2b$10$MutWj1Q.A4uUgleu/8W55.KXOi5xqXaxq8AVANsrwPLTCuMwRrt1.	PPIC	2026-01-18 03:02:36.164	2026-01-18 03:02:36.164
\.


--
-- Data for Name: WorkShift; Type: TABLE DATA; Schema: public; Owner: polyflow
--

COPY public."WorkShift" (id, name, "startTime", "endTime", status, "createdAt", "updatedAt") FROM stdin;
e9f9122a-9409-4d62-9a01-ab22cadfb618	Shift 1	08:00	16:00	ACTIVE	2026-01-20 03:11:41.192	2026-01-20 03:11:41.192
a941e4d4-d9fd-4f8c-af6a-dc61bcd64927	Shift 2	16:00	12:00	ACTIVE	2026-01-20 03:11:59.088	2026-01-20 03:11:59.088
9fd42860-5ff5-4725-a3d8-68e4ecfdf466	Shift 3	00:00	08:00	ACTIVE	2026-01-20 03:12:28.225	2026-01-20 03:12:28.225
\.


--
-- Data for Name: _ShiftHelpers; Type: TABLE DATA; Schema: public; Owner: polyflow
--

COPY public."_ShiftHelpers" ("A", "B") FROM stdin;
62faf4bd-1772-45ca-94af-303b7f486542	800d1c73-610f-4b4c-9fa9-6f8a07b239e3
\.


--
-- Data for Name: _prisma_migrations; Type: TABLE DATA; Schema: public; Owner: polyflow
--

COPY public._prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count) FROM stdin;
45b9d166-e604-4c8e-ba6d-6fd3108465e3	2d97f43ba449cd4289755d8f5c1326661d9c08aff0be44961f66a9a8072f4eac	2026-01-17 13:21:39.773067+00	20260117141709_init	\N	\N	2026-01-17 13:21:39.151495+00	1
bd916b4c-b983-4728-ad73-417bed60cf91	4152a7ba4666254debaeb427ae54ba6840005ea5e9f96af8e50a8b08a016149a	\N	20260107000000_init	A migration failed to apply. New migrations cannot be applied before the error is recovered from. Read more about how to resolve migration issues in a production database: https://pris.ly/d/migrate-resolve\n\nMigration name: 20260107000000_init\n\nDatabase error code: 42710\n\nDatabase error:\nERROR: type "Role" already exists\n\nDbError { severity: "ERROR", parsed_severity: Some(Error), code: SqlState(E42710), message: "type \\"Role\\" already exists", detail: None, hint: None, position: None, where_: None, schema: None, table: None, column: None, datatype: None, constraint: None, file: Some("typecmds.c"), line: Some(1167), routine: Some("DefineEnum") }\n\n   0: sql_schema_connector::apply_migration::apply_script\n           with migration_name="20260107000000_init"\n             at schema-engine/connectors/sql-schema-connector/src/apply_migration.rs:106\n   1: schema_core::commands::apply_migrations::Applying migration\n           with migration_name="20260107000000_init"\n             at schema-engine/core/src/commands/apply_migrations.rs:91\n   2: schema_core::state::ApplyMigrations\n             at schema-engine/core/src/state.rs:226	2026-01-18 04:25:19.607768+00	2026-01-18 04:21:44.607653+00	0
0c11f035-56a9-4ddf-97ea-f1a9fa6cf9b3	4152a7ba4666254debaeb427ae54ba6840005ea5e9f96af8e50a8b08a016149a	2026-01-18 04:25:19.615409+00	20260107000000_init		\N	2026-01-18 04:25:19.615409+00	0
5eef080c-c206-4b64-8226-ad6923dd5d85	d188ace3925de9c549bfa0c583e590570268bc22016a7669c0b84f3ea21ec756	\N	20260114085108_add_cost_to_stock_movement	A migration failed to apply. New migrations cannot be applied before the error is recovered from. Read more about how to resolve migration issues in a production database: https://pris.ly/d/migrate-resolve\n\nMigration name: 20260114085108_add_cost_to_stock_movement\n\nDatabase error code: 42710\n\nDatabase error:\nERROR: enum label "PPIC" already exists\n\nDbError { severity: "ERROR", parsed_severity: Some(Error), code: SqlState(E42710), message: "enum label \\"PPIC\\" already exists", detail: None, hint: None, position: None, where_: None, schema: None, table: None, column: None, datatype: None, constraint: None, file: Some("pg_enum.c"), line: Some(264), routine: Some("AddEnumLabel") }\n\n   0: sql_schema_connector::apply_migration::apply_script\n           with migration_name="20260114085108_add_cost_to_stock_movement"\n             at schema-engine/connectors/sql-schema-connector/src/apply_migration.rs:106\n   1: schema_core::commands::apply_migrations::Applying migration\n           with migration_name="20260114085108_add_cost_to_stock_movement"\n             at schema-engine/core/src/commands/apply_migrations.rs:91\n   2: schema_core::state::ApplyMigrations\n             at schema-engine/core/src/state.rs:226	2026-01-18 04:27:52.27058+00	2026-01-18 04:25:39.994791+00	0
6a3c1118-6c6b-46d8-8925-72aabd3e3f46	d188ace3925de9c549bfa0c583e590570268bc22016a7669c0b84f3ea21ec756	2026-01-18 04:27:52.279153+00	20260114085108_add_cost_to_stock_movement		\N	2026-01-18 04:27:52.279153+00	0
3e2c9263-5823-45da-a43d-f10b44efc5fa	917de66b41afe4bda5ed240c876624bd1ee96906a97b6c0b022d94b4f2948268	2026-01-18 04:27:55.306786+00	20260114090845_add_audit_log		\N	2026-01-18 04:27:55.306786+00	0
ac7dbec0-c903-470a-829b-870db91d30a5	b080ea75843d8d1507f6692faecaf30ce779a55e1928a63fe1d7fef3eb458429	2026-01-18 04:27:58.386201+00	20260115072130_mes_initial_setup		\N	2026-01-18 04:27:58.386201+00	0
d8bbb5cb-36c3-4c44-ac38-0a104ac5b940	0c2026aa947c2b05b087496bedb2bc8f5242cc0ff470f83ce9d781b8bc781761	\N	20260116113211_add_supplier_product	A migration failed to apply. New migrations cannot be applied before the error is recovered from. Read more about how to resolve migration issues in a production database: https://pris.ly/d/migrate-resolve\n\nMigration name: 20260116113211_add_supplier_product\n\nDatabase error code: 42P07\n\nDatabase error:\nERROR: relation "SupplierProduct" already exists\n\nDbError { severity: "ERROR", parsed_severity: Some(Error), code: SqlState(E42P07), message: "relation \\"SupplierProduct\\" already exists", detail: None, hint: None, position: None, where_: None, schema: None, table: None, column: None, datatype: None, constraint: None, file: Some("heap.c"), line: Some(1150), routine: Some("heap_create_with_catalog") }\n\n   0: sql_schema_connector::apply_migration::apply_script\n           with migration_name="20260116113211_add_supplier_product"\n             at schema-engine/connectors/sql-schema-connector/src/apply_migration.rs:106\n   1: schema_core::commands::apply_migrations::Applying migration\n           with migration_name="20260116113211_add_supplier_product"\n             at schema-engine/core/src/commands/apply_migrations.rs:91\n   2: schema_core::state::ApplyMigrations\n             at schema-engine/core/src/state.rs:226	2026-01-18 04:28:01.256275+00	2026-01-18 04:27:58.465291+00	0
f45be2c1-c89e-4afd-8a6e-224cd2294341	0c2026aa947c2b05b087496bedb2bc8f5242cc0ff470f83ce9d781b8bc781761	2026-01-18 04:28:01.262696+00	20260116113211_add_supplier_product		\N	2026-01-18 04:28:01.262696+00	0
6aa7716d-addd-4d79-a9bd-4a4274a8f01b	efb3539084ef35acd095af45d789504ac27aba7d6808296f4f5857801eee6913	2026-01-18 04:28:04.720632+00	20260116122142_separate_contact_to_supplier_customer		\N	2026-01-18 04:28:04.720632+00	0
b2704c3d-c17c-4c40-9dcd-171e19635320	4d2251de3ac7b8dce45604b2f81fc7a9ce4a3dc316e2ef230bd7af67e2c81a56	2026-01-18 04:28:08.122912+00	20260116123314_remove_contact_model		\N	2026-01-18 04:28:08.122912+00	0
31732a90-f3a0-40b7-a30f-617fc77a5932	e898f1363bdd0c22fbb06105cc80b0931cab111fdf5136d728c94cf800668dc0	2026-01-19 14:26:43.420502+00	20260119110640_add_sales_module	\N	\N	2026-01-19 14:26:43.328446+00	1
4512265e-c783-48bc-a18f-b754c3273e83	cd21f9dfeb78d37b5038188249c4897f0d0cdd2281509454edb1fdd67d955774	2026-01-21 02:39:37.411642+00	20260121020257_add_sales_quotation	\N	\N	2026-01-21 02:39:37.335105+00	1
5deaaa6d-ca26-4722-becc-da0a063634f5	b7a664098528d0042d4b70b717e56b2b920f6a59ebf8be8b62cd6785e3ef0ea6	2026-01-19 14:26:43.432892+00	20260119111248_add_sales_production_link	\N	\N	2026-01-19 14:26:43.421743+00	1
1f2b2a12-6588-49d3-a38e-eb5762582de5	5f1a78941d851f9550b5a7b56d7be315bddb838175d27403ee6c513209d63c4e	2026-01-20 03:40:59.291583+00	20260120020011_add_costing_methods	\N	\N	2026-01-20 03:40:59.250134+00	1
049e2a0a-5e4b-4e5b-a371-5087d693edf2	3715ef59248ce8aa642a7b38ab871eb8f26a4f7a4b43d3e5b1656b7ee1e8541a	2026-01-20 22:34:43.257787+00	20260120133156_add_purchasing_module	\N	\N	2026-01-20 22:34:43.128069+00	1
ff8e8ae1-65f6-442e-8f8e-a352b38d7a70	a3dd9751721b78c46f8680b76edf4f7175096d42c554b296cd5f94026437bac0	2026-01-20 22:34:43.268953+00	20260120133352_refine_purchasing_movements_fix	\N	\N	2026-01-20 22:34:43.259183+00	1
25e251e1-1bdc-4154-b950-5d0c41d2cd01	606be2aff0f9aee60f5680fa9b40ff044f6d8bb26307ed2a8b596f532888d10a	2026-01-20 22:34:43.300264+00	20260120221423_add_purchase_payment	\N	\N	2026-01-20 22:34:43.270847+00	1
dccc47ea-f01f-4dba-a76d-9ac5dd27ba58	d190ca101d4ec2c728e03cb3e3b803b9c97374bbeada45224b306531b3acac06	2026-01-21 02:39:37.332613+00	20260121012709_add_sales_tax_and_discount	\N	\N	2026-01-21 02:39:37.314642+00	1
\.


--
-- Name: AuditLog AuditLog_pkey; Type: CONSTRAINT; Schema: public; Owner: polyflow
--

ALTER TABLE ONLY public."AuditLog"
    ADD CONSTRAINT "AuditLog_pkey" PRIMARY KEY (id);


--
-- Name: Batch Batch_pkey; Type: CONSTRAINT; Schema: public; Owner: polyflow
--

ALTER TABLE ONLY public."Batch"
    ADD CONSTRAINT "Batch_pkey" PRIMARY KEY (id);


--
-- Name: BomItem BomItem_pkey; Type: CONSTRAINT; Schema: public; Owner: polyflow
--

ALTER TABLE ONLY public."BomItem"
    ADD CONSTRAINT "BomItem_pkey" PRIMARY KEY (id);


--
-- Name: Bom Bom_pkey; Type: CONSTRAINT; Schema: public; Owner: polyflow
--

ALTER TABLE ONLY public."Bom"
    ADD CONSTRAINT "Bom_pkey" PRIMARY KEY (id);


--
-- Name: Customer Customer_pkey; Type: CONSTRAINT; Schema: public; Owner: polyflow
--

ALTER TABLE ONLY public."Customer"
    ADD CONSTRAINT "Customer_pkey" PRIMARY KEY (id);


--
-- Name: Employee Employee_pkey; Type: CONSTRAINT; Schema: public; Owner: polyflow
--

ALTER TABLE ONLY public."Employee"
    ADD CONSTRAINT "Employee_pkey" PRIMARY KEY (id);


--
-- Name: GoodsReceiptItem GoodsReceiptItem_pkey; Type: CONSTRAINT; Schema: public; Owner: polyflow
--

ALTER TABLE ONLY public."GoodsReceiptItem"
    ADD CONSTRAINT "GoodsReceiptItem_pkey" PRIMARY KEY (id);


--
-- Name: GoodsReceipt GoodsReceipt_pkey; Type: CONSTRAINT; Schema: public; Owner: polyflow
--

ALTER TABLE ONLY public."GoodsReceipt"
    ADD CONSTRAINT "GoodsReceipt_pkey" PRIMARY KEY (id);


--
-- Name: Inventory Inventory_pkey; Type: CONSTRAINT; Schema: public; Owner: polyflow
--

ALTER TABLE ONLY public."Inventory"
    ADD CONSTRAINT "Inventory_pkey" PRIMARY KEY (id);


--
-- Name: Invoice Invoice_pkey; Type: CONSTRAINT; Schema: public; Owner: polyflow
--

ALTER TABLE ONLY public."Invoice"
    ADD CONSTRAINT "Invoice_pkey" PRIMARY KEY (id);


--
-- Name: JobRole JobRole_pkey; Type: CONSTRAINT; Schema: public; Owner: polyflow
--

ALTER TABLE ONLY public."JobRole"
    ADD CONSTRAINT "JobRole_pkey" PRIMARY KEY (id);


--
-- Name: Location Location_pkey; Type: CONSTRAINT; Schema: public; Owner: polyflow
--

ALTER TABLE ONLY public."Location"
    ADD CONSTRAINT "Location_pkey" PRIMARY KEY (id);


--
-- Name: MachineDowntime MachineDowntime_pkey; Type: CONSTRAINT; Schema: public; Owner: polyflow
--

ALTER TABLE ONLY public."MachineDowntime"
    ADD CONSTRAINT "MachineDowntime_pkey" PRIMARY KEY (id);


--
-- Name: Machine Machine_pkey; Type: CONSTRAINT; Schema: public; Owner: polyflow
--

ALTER TABLE ONLY public."Machine"
    ADD CONSTRAINT "Machine_pkey" PRIMARY KEY (id);


--
-- Name: MaterialIssue MaterialIssue_pkey; Type: CONSTRAINT; Schema: public; Owner: polyflow
--

ALTER TABLE ONLY public."MaterialIssue"
    ADD CONSTRAINT "MaterialIssue_pkey" PRIMARY KEY (id);


--
-- Name: ProductVariant ProductVariant_pkey; Type: CONSTRAINT; Schema: public; Owner: polyflow
--

ALTER TABLE ONLY public."ProductVariant"
    ADD CONSTRAINT "ProductVariant_pkey" PRIMARY KEY (id);


--
-- Name: Product Product_pkey; Type: CONSTRAINT; Schema: public; Owner: polyflow
--

ALTER TABLE ONLY public."Product"
    ADD CONSTRAINT "Product_pkey" PRIMARY KEY (id);


--
-- Name: ProductionExecution ProductionExecution_pkey; Type: CONSTRAINT; Schema: public; Owner: polyflow
--

ALTER TABLE ONLY public."ProductionExecution"
    ADD CONSTRAINT "ProductionExecution_pkey" PRIMARY KEY (id);


--
-- Name: ProductionMaterial ProductionMaterial_pkey; Type: CONSTRAINT; Schema: public; Owner: polyflow
--

ALTER TABLE ONLY public."ProductionMaterial"
    ADD CONSTRAINT "ProductionMaterial_pkey" PRIMARY KEY (id);


--
-- Name: ProductionOrder ProductionOrder_pkey; Type: CONSTRAINT; Schema: public; Owner: polyflow
--

ALTER TABLE ONLY public."ProductionOrder"
    ADD CONSTRAINT "ProductionOrder_pkey" PRIMARY KEY (id);


--
-- Name: ProductionShift ProductionShift_pkey; Type: CONSTRAINT; Schema: public; Owner: polyflow
--

ALTER TABLE ONLY public."ProductionShift"
    ADD CONSTRAINT "ProductionShift_pkey" PRIMARY KEY (id);


--
-- Name: PurchaseInvoice PurchaseInvoice_pkey; Type: CONSTRAINT; Schema: public; Owner: polyflow
--

ALTER TABLE ONLY public."PurchaseInvoice"
    ADD CONSTRAINT "PurchaseInvoice_pkey" PRIMARY KEY (id);


--
-- Name: PurchaseOrderItem PurchaseOrderItem_pkey; Type: CONSTRAINT; Schema: public; Owner: polyflow
--

ALTER TABLE ONLY public."PurchaseOrderItem"
    ADD CONSTRAINT "PurchaseOrderItem_pkey" PRIMARY KEY (id);


--
-- Name: PurchaseOrder PurchaseOrder_pkey; Type: CONSTRAINT; Schema: public; Owner: polyflow
--

ALTER TABLE ONLY public."PurchaseOrder"
    ADD CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY (id);


--
-- Name: PurchasePayment PurchasePayment_pkey; Type: CONSTRAINT; Schema: public; Owner: polyflow
--

ALTER TABLE ONLY public."PurchasePayment"
    ADD CONSTRAINT "PurchasePayment_pkey" PRIMARY KEY (id);


--
-- Name: QualityInspection QualityInspection_pkey; Type: CONSTRAINT; Schema: public; Owner: polyflow
--

ALTER TABLE ONLY public."QualityInspection"
    ADD CONSTRAINT "QualityInspection_pkey" PRIMARY KEY (id);


--
-- Name: RolePermission RolePermission_pkey; Type: CONSTRAINT; Schema: public; Owner: polyflow
--

ALTER TABLE ONLY public."RolePermission"
    ADD CONSTRAINT "RolePermission_pkey" PRIMARY KEY (id);


--
-- Name: SalesOrderItem SalesOrderItem_pkey; Type: CONSTRAINT; Schema: public; Owner: polyflow
--

ALTER TABLE ONLY public."SalesOrderItem"
    ADD CONSTRAINT "SalesOrderItem_pkey" PRIMARY KEY (id);


--
-- Name: SalesOrder SalesOrder_pkey; Type: CONSTRAINT; Schema: public; Owner: polyflow
--

ALTER TABLE ONLY public."SalesOrder"
    ADD CONSTRAINT "SalesOrder_pkey" PRIMARY KEY (id);


--
-- Name: SalesQuotationItem SalesQuotationItem_pkey; Type: CONSTRAINT; Schema: public; Owner: polyflow
--

ALTER TABLE ONLY public."SalesQuotationItem"
    ADD CONSTRAINT "SalesQuotationItem_pkey" PRIMARY KEY (id);


--
-- Name: SalesQuotation SalesQuotation_pkey; Type: CONSTRAINT; Schema: public; Owner: polyflow
--

ALTER TABLE ONLY public."SalesQuotation"
    ADD CONSTRAINT "SalesQuotation_pkey" PRIMARY KEY (id);


--
-- Name: ScrapRecord ScrapRecord_pkey; Type: CONSTRAINT; Schema: public; Owner: polyflow
--

ALTER TABLE ONLY public."ScrapRecord"
    ADD CONSTRAINT "ScrapRecord_pkey" PRIMARY KEY (id);


--
-- Name: StockMovement StockMovement_pkey; Type: CONSTRAINT; Schema: public; Owner: polyflow
--

ALTER TABLE ONLY public."StockMovement"
    ADD CONSTRAINT "StockMovement_pkey" PRIMARY KEY (id);


--
-- Name: StockOpnameItem StockOpnameItem_pkey; Type: CONSTRAINT; Schema: public; Owner: polyflow
--

ALTER TABLE ONLY public."StockOpnameItem"
    ADD CONSTRAINT "StockOpnameItem_pkey" PRIMARY KEY (id);


--
-- Name: StockOpname StockOpname_pkey; Type: CONSTRAINT; Schema: public; Owner: polyflow
--

ALTER TABLE ONLY public."StockOpname"
    ADD CONSTRAINT "StockOpname_pkey" PRIMARY KEY (id);


--
-- Name: StockReservation StockReservation_pkey; Type: CONSTRAINT; Schema: public; Owner: polyflow
--

ALTER TABLE ONLY public."StockReservation"
    ADD CONSTRAINT "StockReservation_pkey" PRIMARY KEY (id);


--
-- Name: SupplierProduct SupplierProduct_pkey; Type: CONSTRAINT; Schema: public; Owner: polyflow
--

ALTER TABLE ONLY public."SupplierProduct"
    ADD CONSTRAINT "SupplierProduct_pkey" PRIMARY KEY (id);


--
-- Name: Supplier Supplier_pkey; Type: CONSTRAINT; Schema: public; Owner: polyflow
--

ALTER TABLE ONLY public."Supplier"
    ADD CONSTRAINT "Supplier_pkey" PRIMARY KEY (id);


--
-- Name: User User_pkey; Type: CONSTRAINT; Schema: public; Owner: polyflow
--

ALTER TABLE ONLY public."User"
    ADD CONSTRAINT "User_pkey" PRIMARY KEY (id);


--
-- Name: WorkShift WorkShift_pkey; Type: CONSTRAINT; Schema: public; Owner: polyflow
--

ALTER TABLE ONLY public."WorkShift"
    ADD CONSTRAINT "WorkShift_pkey" PRIMARY KEY (id);


--
-- Name: _prisma_migrations _prisma_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: polyflow
--

ALTER TABLE ONLY public._prisma_migrations
    ADD CONSTRAINT _prisma_migrations_pkey PRIMARY KEY (id);


--
-- Name: Batch_batchNumber_key; Type: INDEX; Schema: public; Owner: polyflow
--

CREATE UNIQUE INDEX "Batch_batchNumber_key" ON public."Batch" USING btree ("batchNumber");


--
-- Name: Customer_code_key; Type: INDEX; Schema: public; Owner: polyflow
--

CREATE UNIQUE INDEX "Customer_code_key" ON public."Customer" USING btree (code);


--
-- Name: Employee_code_key; Type: INDEX; Schema: public; Owner: polyflow
--

CREATE UNIQUE INDEX "Employee_code_key" ON public."Employee" USING btree (code);


--
-- Name: GoodsReceipt_receiptNumber_key; Type: INDEX; Schema: public; Owner: polyflow
--

CREATE UNIQUE INDEX "GoodsReceipt_receiptNumber_key" ON public."GoodsReceipt" USING btree ("receiptNumber");


--
-- Name: Inventory_locationId_productVariantId_key; Type: INDEX; Schema: public; Owner: polyflow
--

CREATE UNIQUE INDEX "Inventory_locationId_productVariantId_key" ON public."Inventory" USING btree ("locationId", "productVariantId");


--
-- Name: Invoice_invoiceNumber_key; Type: INDEX; Schema: public; Owner: polyflow
--

CREATE UNIQUE INDEX "Invoice_invoiceNumber_key" ON public."Invoice" USING btree ("invoiceNumber");


--
-- Name: Invoice_salesOrderId_idx; Type: INDEX; Schema: public; Owner: polyflow
--

CREATE INDEX "Invoice_salesOrderId_idx" ON public."Invoice" USING btree ("salesOrderId");


--
-- Name: JobRole_name_key; Type: INDEX; Schema: public; Owner: polyflow
--

CREATE UNIQUE INDEX "JobRole_name_key" ON public."JobRole" USING btree (name);


--
-- Name: Location_slug_key; Type: INDEX; Schema: public; Owner: polyflow
--

CREATE UNIQUE INDEX "Location_slug_key" ON public."Location" USING btree (slug);


--
-- Name: MachineDowntime_machineId_idx; Type: INDEX; Schema: public; Owner: polyflow
--

CREATE INDEX "MachineDowntime_machineId_idx" ON public."MachineDowntime" USING btree ("machineId");


--
-- Name: Machine_code_key; Type: INDEX; Schema: public; Owner: polyflow
--

CREATE UNIQUE INDEX "Machine_code_key" ON public."Machine" USING btree (code);


--
-- Name: ProductVariant_skuCode_key; Type: INDEX; Schema: public; Owner: polyflow
--

CREATE UNIQUE INDEX "ProductVariant_skuCode_key" ON public."ProductVariant" USING btree ("skuCode");


--
-- Name: ProductionExecution_productionOrderId_idx; Type: INDEX; Schema: public; Owner: polyflow
--

CREATE INDEX "ProductionExecution_productionOrderId_idx" ON public."ProductionExecution" USING btree ("productionOrderId");


--
-- Name: ProductionMaterial_productVariantId_idx; Type: INDEX; Schema: public; Owner: polyflow
--

CREATE INDEX "ProductionMaterial_productVariantId_idx" ON public."ProductionMaterial" USING btree ("productVariantId");


--
-- Name: ProductionMaterial_productionOrderId_idx; Type: INDEX; Schema: public; Owner: polyflow
--

CREATE INDEX "ProductionMaterial_productionOrderId_idx" ON public."ProductionMaterial" USING btree ("productionOrderId");


--
-- Name: ProductionOrder_orderNumber_key; Type: INDEX; Schema: public; Owner: polyflow
--

CREATE UNIQUE INDEX "ProductionOrder_orderNumber_key" ON public."ProductionOrder" USING btree ("orderNumber");


--
-- Name: PurchaseInvoice_invoiceNumber_key; Type: INDEX; Schema: public; Owner: polyflow
--

CREATE UNIQUE INDEX "PurchaseInvoice_invoiceNumber_key" ON public."PurchaseInvoice" USING btree ("invoiceNumber");


--
-- Name: PurchaseOrder_orderNumber_key; Type: INDEX; Schema: public; Owner: polyflow
--

CREATE UNIQUE INDEX "PurchaseOrder_orderNumber_key" ON public."PurchaseOrder" USING btree ("orderNumber");


--
-- Name: PurchasePayment_purchaseInvoiceId_idx; Type: INDEX; Schema: public; Owner: polyflow
--

CREATE INDEX "PurchasePayment_purchaseInvoiceId_idx" ON public."PurchasePayment" USING btree ("purchaseInvoiceId");


--
-- Name: RolePermission_role_resource_key; Type: INDEX; Schema: public; Owner: polyflow
--

CREATE UNIQUE INDEX "RolePermission_role_resource_key" ON public."RolePermission" USING btree (role, resource);


--
-- Name: SalesOrderItem_salesOrderId_idx; Type: INDEX; Schema: public; Owner: polyflow
--

CREATE INDEX "SalesOrderItem_salesOrderId_idx" ON public."SalesOrderItem" USING btree ("salesOrderId");


--
-- Name: SalesOrder_orderNumber_key; Type: INDEX; Schema: public; Owner: polyflow
--

CREATE UNIQUE INDEX "SalesOrder_orderNumber_key" ON public."SalesOrder" USING btree ("orderNumber");


--
-- Name: SalesQuotation_quotationNumber_key; Type: INDEX; Schema: public; Owner: polyflow
--

CREATE UNIQUE INDEX "SalesQuotation_quotationNumber_key" ON public."SalesQuotation" USING btree ("quotationNumber");


--
-- Name: StockOpnameItem_opnameId_productVariantId_key; Type: INDEX; Schema: public; Owner: polyflow
--

CREATE UNIQUE INDEX "StockOpnameItem_opnameId_productVariantId_key" ON public."StockOpnameItem" USING btree ("opnameId", "productVariantId");


--
-- Name: SupplierProduct_supplierId_productVariantId_key; Type: INDEX; Schema: public; Owner: polyflow
--

CREATE UNIQUE INDEX "SupplierProduct_supplierId_productVariantId_key" ON public."SupplierProduct" USING btree ("supplierId", "productVariantId");


--
-- Name: Supplier_code_key; Type: INDEX; Schema: public; Owner: polyflow
--

CREATE UNIQUE INDEX "Supplier_code_key" ON public."Supplier" USING btree (code);


--
-- Name: User_email_key; Type: INDEX; Schema: public; Owner: polyflow
--

CREATE UNIQUE INDEX "User_email_key" ON public."User" USING btree (email);


--
-- Name: _ShiftHelpers_AB_unique; Type: INDEX; Schema: public; Owner: polyflow
--

CREATE UNIQUE INDEX "_ShiftHelpers_AB_unique" ON public."_ShiftHelpers" USING btree ("A", "B");


--
-- Name: _ShiftHelpers_B_index; Type: INDEX; Schema: public; Owner: polyflow
--

CREATE INDEX "_ShiftHelpers_B_index" ON public."_ShiftHelpers" USING btree ("B");


--
-- Name: AuditLog AuditLog_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: polyflow
--

ALTER TABLE ONLY public."AuditLog"
    ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Batch Batch_locationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: polyflow
--

ALTER TABLE ONLY public."Batch"
    ADD CONSTRAINT "Batch_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES public."Location"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Batch Batch_productVariantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: polyflow
--

ALTER TABLE ONLY public."Batch"
    ADD CONSTRAINT "Batch_productVariantId_fkey" FOREIGN KEY ("productVariantId") REFERENCES public."ProductVariant"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: BomItem BomItem_bomId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: polyflow
--

ALTER TABLE ONLY public."BomItem"
    ADD CONSTRAINT "BomItem_bomId_fkey" FOREIGN KEY ("bomId") REFERENCES public."Bom"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: BomItem BomItem_productVariantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: polyflow
--

ALTER TABLE ONLY public."BomItem"
    ADD CONSTRAINT "BomItem_productVariantId_fkey" FOREIGN KEY ("productVariantId") REFERENCES public."ProductVariant"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Bom Bom_productVariantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: polyflow
--

ALTER TABLE ONLY public."Bom"
    ADD CONSTRAINT "Bom_productVariantId_fkey" FOREIGN KEY ("productVariantId") REFERENCES public."ProductVariant"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: GoodsReceiptItem GoodsReceiptItem_goodsReceiptId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: polyflow
--

ALTER TABLE ONLY public."GoodsReceiptItem"
    ADD CONSTRAINT "GoodsReceiptItem_goodsReceiptId_fkey" FOREIGN KEY ("goodsReceiptId") REFERENCES public."GoodsReceipt"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: GoodsReceiptItem GoodsReceiptItem_productVariantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: polyflow
--

ALTER TABLE ONLY public."GoodsReceiptItem"
    ADD CONSTRAINT "GoodsReceiptItem_productVariantId_fkey" FOREIGN KEY ("productVariantId") REFERENCES public."ProductVariant"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: GoodsReceipt GoodsReceipt_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: polyflow
--

ALTER TABLE ONLY public."GoodsReceipt"
    ADD CONSTRAINT "GoodsReceipt_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: GoodsReceipt GoodsReceipt_locationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: polyflow
--

ALTER TABLE ONLY public."GoodsReceipt"
    ADD CONSTRAINT "GoodsReceipt_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES public."Location"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: GoodsReceipt GoodsReceipt_purchaseOrderId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: polyflow
--

ALTER TABLE ONLY public."GoodsReceipt"
    ADD CONSTRAINT "GoodsReceipt_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES public."PurchaseOrder"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Inventory Inventory_locationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: polyflow
--

ALTER TABLE ONLY public."Inventory"
    ADD CONSTRAINT "Inventory_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES public."Location"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Inventory Inventory_productVariantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: polyflow
--

ALTER TABLE ONLY public."Inventory"
    ADD CONSTRAINT "Inventory_productVariantId_fkey" FOREIGN KEY ("productVariantId") REFERENCES public."ProductVariant"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Invoice Invoice_salesOrderId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: polyflow
--

ALTER TABLE ONLY public."Invoice"
    ADD CONSTRAINT "Invoice_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES public."SalesOrder"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: MachineDowntime MachineDowntime_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: polyflow
--

ALTER TABLE ONLY public."MachineDowntime"
    ADD CONSTRAINT "MachineDowntime_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: MachineDowntime MachineDowntime_machineId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: polyflow
--

ALTER TABLE ONLY public."MachineDowntime"
    ADD CONSTRAINT "MachineDowntime_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES public."Machine"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Machine Machine_locationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: polyflow
--

ALTER TABLE ONLY public."Machine"
    ADD CONSTRAINT "Machine_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES public."Location"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: MaterialIssue MaterialIssue_batchId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: polyflow
--

ALTER TABLE ONLY public."MaterialIssue"
    ADD CONSTRAINT "MaterialIssue_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES public."Batch"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: MaterialIssue MaterialIssue_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: polyflow
--

ALTER TABLE ONLY public."MaterialIssue"
    ADD CONSTRAINT "MaterialIssue_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: MaterialIssue MaterialIssue_productVariantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: polyflow
--

ALTER TABLE ONLY public."MaterialIssue"
    ADD CONSTRAINT "MaterialIssue_productVariantId_fkey" FOREIGN KEY ("productVariantId") REFERENCES public."ProductVariant"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: MaterialIssue MaterialIssue_productionOrderId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: polyflow
--

ALTER TABLE ONLY public."MaterialIssue"
    ADD CONSTRAINT "MaterialIssue_productionOrderId_fkey" FOREIGN KEY ("productionOrderId") REFERENCES public."ProductionOrder"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: ProductVariant ProductVariant_preferredSupplierId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: polyflow
--

ALTER TABLE ONLY public."ProductVariant"
    ADD CONSTRAINT "ProductVariant_preferredSupplierId_fkey" FOREIGN KEY ("preferredSupplierId") REFERENCES public."Supplier"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: ProductVariant ProductVariant_productId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: polyflow
--

ALTER TABLE ONLY public."ProductVariant"
    ADD CONSTRAINT "ProductVariant_productId_fkey" FOREIGN KEY ("productId") REFERENCES public."Product"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: ProductionExecution ProductionExecution_machineId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: polyflow
--

ALTER TABLE ONLY public."ProductionExecution"
    ADD CONSTRAINT "ProductionExecution_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES public."Machine"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: ProductionExecution ProductionExecution_operatorId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: polyflow
--

ALTER TABLE ONLY public."ProductionExecution"
    ADD CONSTRAINT "ProductionExecution_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES public."Employee"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: ProductionExecution ProductionExecution_productionOrderId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: polyflow
--

ALTER TABLE ONLY public."ProductionExecution"
    ADD CONSTRAINT "ProductionExecution_productionOrderId_fkey" FOREIGN KEY ("productionOrderId") REFERENCES public."ProductionOrder"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: ProductionExecution ProductionExecution_shiftId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: polyflow
--

ALTER TABLE ONLY public."ProductionExecution"
    ADD CONSTRAINT "ProductionExecution_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES public."WorkShift"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: ProductionMaterial ProductionMaterial_productVariantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: polyflow
--

ALTER TABLE ONLY public."ProductionMaterial"
    ADD CONSTRAINT "ProductionMaterial_productVariantId_fkey" FOREIGN KEY ("productVariantId") REFERENCES public."ProductVariant"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: ProductionMaterial ProductionMaterial_productionOrderId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: polyflow
--

ALTER TABLE ONLY public."ProductionMaterial"
    ADD CONSTRAINT "ProductionMaterial_productionOrderId_fkey" FOREIGN KEY ("productionOrderId") REFERENCES public."ProductionOrder"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: ProductionOrder ProductionOrder_bomId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: polyflow
--

ALTER TABLE ONLY public."ProductionOrder"
    ADD CONSTRAINT "ProductionOrder_bomId_fkey" FOREIGN KEY ("bomId") REFERENCES public."Bom"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: ProductionOrder ProductionOrder_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: polyflow
--

ALTER TABLE ONLY public."ProductionOrder"
    ADD CONSTRAINT "ProductionOrder_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: ProductionOrder ProductionOrder_locationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: polyflow
--

ALTER TABLE ONLY public."ProductionOrder"
    ADD CONSTRAINT "ProductionOrder_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES public."Location"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: ProductionOrder ProductionOrder_machineId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: polyflow
--

ALTER TABLE ONLY public."ProductionOrder"
    ADD CONSTRAINT "ProductionOrder_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES public."Machine"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: ProductionOrder ProductionOrder_salesOrderId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: polyflow
--

ALTER TABLE ONLY public."ProductionOrder"
    ADD CONSTRAINT "ProductionOrder_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES public."SalesOrder"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: ProductionShift ProductionShift_operatorId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: polyflow
--

ALTER TABLE ONLY public."ProductionShift"
    ADD CONSTRAINT "ProductionShift_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES public."Employee"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: ProductionShift ProductionShift_productionOrderId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: polyflow
--

ALTER TABLE ONLY public."ProductionShift"
    ADD CONSTRAINT "ProductionShift_productionOrderId_fkey" FOREIGN KEY ("productionOrderId") REFERENCES public."ProductionOrder"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: PurchaseInvoice PurchaseInvoice_purchaseOrderId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: polyflow
--

ALTER TABLE ONLY public."PurchaseInvoice"
    ADD CONSTRAINT "PurchaseInvoice_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES public."PurchaseOrder"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: PurchaseOrderItem PurchaseOrderItem_productVariantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: polyflow
--

ALTER TABLE ONLY public."PurchaseOrderItem"
    ADD CONSTRAINT "PurchaseOrderItem_productVariantId_fkey" FOREIGN KEY ("productVariantId") REFERENCES public."ProductVariant"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: PurchaseOrderItem PurchaseOrderItem_purchaseOrderId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: polyflow
--

ALTER TABLE ONLY public."PurchaseOrderItem"
    ADD CONSTRAINT "PurchaseOrderItem_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES public."PurchaseOrder"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: PurchaseOrder PurchaseOrder_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: polyflow
--

ALTER TABLE ONLY public."PurchaseOrder"
    ADD CONSTRAINT "PurchaseOrder_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: PurchaseOrder PurchaseOrder_supplierId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: polyflow
--

ALTER TABLE ONLY public."PurchaseOrder"
    ADD CONSTRAINT "PurchaseOrder_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES public."Supplier"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: PurchasePayment PurchasePayment_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: polyflow
--

ALTER TABLE ONLY public."PurchasePayment"
    ADD CONSTRAINT "PurchasePayment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: PurchasePayment PurchasePayment_purchaseInvoiceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: polyflow
--

ALTER TABLE ONLY public."PurchasePayment"
    ADD CONSTRAINT "PurchasePayment_purchaseInvoiceId_fkey" FOREIGN KEY ("purchaseInvoiceId") REFERENCES public."PurchaseInvoice"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: QualityInspection QualityInspection_inspectorId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: polyflow
--

ALTER TABLE ONLY public."QualityInspection"
    ADD CONSTRAINT "QualityInspection_inspectorId_fkey" FOREIGN KEY ("inspectorId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: QualityInspection QualityInspection_productionOrderId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: polyflow
--

ALTER TABLE ONLY public."QualityInspection"
    ADD CONSTRAINT "QualityInspection_productionOrderId_fkey" FOREIGN KEY ("productionOrderId") REFERENCES public."ProductionOrder"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: SalesOrderItem SalesOrderItem_productVariantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: polyflow
--

ALTER TABLE ONLY public."SalesOrderItem"
    ADD CONSTRAINT "SalesOrderItem_productVariantId_fkey" FOREIGN KEY ("productVariantId") REFERENCES public."ProductVariant"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: SalesOrderItem SalesOrderItem_salesOrderId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: polyflow
--

ALTER TABLE ONLY public."SalesOrderItem"
    ADD CONSTRAINT "SalesOrderItem_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES public."SalesOrder"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: SalesOrder SalesOrder_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: polyflow
--

ALTER TABLE ONLY public."SalesOrder"
    ADD CONSTRAINT "SalesOrder_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: SalesOrder SalesOrder_customerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: polyflow
--

ALTER TABLE ONLY public."SalesOrder"
    ADD CONSTRAINT "SalesOrder_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES public."Customer"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: SalesOrder SalesOrder_quotationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: polyflow
--

ALTER TABLE ONLY public."SalesOrder"
    ADD CONSTRAINT "SalesOrder_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES public."SalesQuotation"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: SalesOrder SalesOrder_sourceLocationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: polyflow
--

ALTER TABLE ONLY public."SalesOrder"
    ADD CONSTRAINT "SalesOrder_sourceLocationId_fkey" FOREIGN KEY ("sourceLocationId") REFERENCES public."Location"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: SalesQuotationItem SalesQuotationItem_productVariantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: polyflow
--

ALTER TABLE ONLY public."SalesQuotationItem"
    ADD CONSTRAINT "SalesQuotationItem_productVariantId_fkey" FOREIGN KEY ("productVariantId") REFERENCES public."ProductVariant"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: SalesQuotationItem SalesQuotationItem_salesQuotationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: polyflow
--

ALTER TABLE ONLY public."SalesQuotationItem"
    ADD CONSTRAINT "SalesQuotationItem_salesQuotationId_fkey" FOREIGN KEY ("salesQuotationId") REFERENCES public."SalesQuotation"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: SalesQuotation SalesQuotation_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: polyflow
--

ALTER TABLE ONLY public."SalesQuotation"
    ADD CONSTRAINT "SalesQuotation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: SalesQuotation SalesQuotation_customerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: polyflow
--

ALTER TABLE ONLY public."SalesQuotation"
    ADD CONSTRAINT "SalesQuotation_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES public."Customer"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: ScrapRecord ScrapRecord_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: polyflow
--

ALTER TABLE ONLY public."ScrapRecord"
    ADD CONSTRAINT "ScrapRecord_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: ScrapRecord ScrapRecord_productVariantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: polyflow
--

ALTER TABLE ONLY public."ScrapRecord"
    ADD CONSTRAINT "ScrapRecord_productVariantId_fkey" FOREIGN KEY ("productVariantId") REFERENCES public."ProductVariant"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: ScrapRecord ScrapRecord_productionOrderId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: polyflow
--

ALTER TABLE ONLY public."ScrapRecord"
    ADD CONSTRAINT "ScrapRecord_productionOrderId_fkey" FOREIGN KEY ("productionOrderId") REFERENCES public."ProductionOrder"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: StockMovement StockMovement_batchId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: polyflow
--

ALTER TABLE ONLY public."StockMovement"
    ADD CONSTRAINT "StockMovement_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES public."Batch"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: StockMovement StockMovement_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: polyflow
--

ALTER TABLE ONLY public."StockMovement"
    ADD CONSTRAINT "StockMovement_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: StockMovement StockMovement_fromLocationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: polyflow
--

ALTER TABLE ONLY public."StockMovement"
    ADD CONSTRAINT "StockMovement_fromLocationId_fkey" FOREIGN KEY ("fromLocationId") REFERENCES public."Location"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: StockMovement StockMovement_goodsReceiptId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: polyflow
--

ALTER TABLE ONLY public."StockMovement"
    ADD CONSTRAINT "StockMovement_goodsReceiptId_fkey" FOREIGN KEY ("goodsReceiptId") REFERENCES public."GoodsReceipt"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: StockMovement StockMovement_productVariantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: polyflow
--

ALTER TABLE ONLY public."StockMovement"
    ADD CONSTRAINT "StockMovement_productVariantId_fkey" FOREIGN KEY ("productVariantId") REFERENCES public."ProductVariant"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: StockMovement StockMovement_salesOrderId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: polyflow
--

ALTER TABLE ONLY public."StockMovement"
    ADD CONSTRAINT "StockMovement_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES public."SalesOrder"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: StockMovement StockMovement_toLocationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: polyflow
--

ALTER TABLE ONLY public."StockMovement"
    ADD CONSTRAINT "StockMovement_toLocationId_fkey" FOREIGN KEY ("toLocationId") REFERENCES public."Location"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: StockOpnameItem StockOpnameItem_opnameId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: polyflow
--

ALTER TABLE ONLY public."StockOpnameItem"
    ADD CONSTRAINT "StockOpnameItem_opnameId_fkey" FOREIGN KEY ("opnameId") REFERENCES public."StockOpname"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: StockOpnameItem StockOpnameItem_productVariantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: polyflow
--

ALTER TABLE ONLY public."StockOpnameItem"
    ADD CONSTRAINT "StockOpnameItem_productVariantId_fkey" FOREIGN KEY ("productVariantId") REFERENCES public."ProductVariant"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: StockOpname StockOpname_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: polyflow
--

ALTER TABLE ONLY public."StockOpname"
    ADD CONSTRAINT "StockOpname_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: StockOpname StockOpname_locationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: polyflow
--

ALTER TABLE ONLY public."StockOpname"
    ADD CONSTRAINT "StockOpname_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES public."Location"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: StockReservation StockReservation_locationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: polyflow
--

ALTER TABLE ONLY public."StockReservation"
    ADD CONSTRAINT "StockReservation_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES public."Location"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: StockReservation StockReservation_productVariantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: polyflow
--

ALTER TABLE ONLY public."StockReservation"
    ADD CONSTRAINT "StockReservation_productVariantId_fkey" FOREIGN KEY ("productVariantId") REFERENCES public."ProductVariant"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: SupplierProduct SupplierProduct_productVariantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: polyflow
--

ALTER TABLE ONLY public."SupplierProduct"
    ADD CONSTRAINT "SupplierProduct_productVariantId_fkey" FOREIGN KEY ("productVariantId") REFERENCES public."ProductVariant"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: SupplierProduct SupplierProduct_supplierId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: polyflow
--

ALTER TABLE ONLY public."SupplierProduct"
    ADD CONSTRAINT "SupplierProduct_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES public."Supplier"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: _ShiftHelpers _ShiftHelpers_A_fkey; Type: FK CONSTRAINT; Schema: public; Owner: polyflow
--

ALTER TABLE ONLY public."_ShiftHelpers"
    ADD CONSTRAINT "_ShiftHelpers_A_fkey" FOREIGN KEY ("A") REFERENCES public."Employee"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: _ShiftHelpers _ShiftHelpers_B_fkey; Type: FK CONSTRAINT; Schema: public; Owner: polyflow
--

ALTER TABLE ONLY public."_ShiftHelpers"
    ADD CONSTRAINT "_ShiftHelpers_B_fkey" FOREIGN KEY ("B") REFERENCES public."ProductionShift"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict omo99eXDdBHTjH1wryIVxdNO3ZAqITTCfEwHBg1BWadduPizXgjNBnswZxWJiCk


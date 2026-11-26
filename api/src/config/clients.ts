import { prisma } from "../lib/prisma.js";
import type { Branding } from "./branding.js";
import { updateBranding } from "./branding.js";
import type { MappingRecipe } from "../lib/mappingEngine.js";

export type CustomerProfile = {
  slug: string;
  name: string;
  tagline: string;
  branding: Branding;
  story: {
    industry: string;
    hq: string;
    size: string;
    erpName: string;
    apiStyle: string;
    summary: string;
    howTheyWork: string[];
    painPoints: string[];
  };
  mapping: MappingRecipe;
};

/** Bluebox = clean modern finance API. Harbor = legacy messy ERP. */
export const CLIENTS: CustomerProfile[] = [
  {
    slug: "bluebox",
    name: "Bluebox Arts",
    tagline: "Chamber rooms & late shows",
    branding: {
      brandName: "Bluebox Arts",
      primary: "#1565C0",
      secondary: "#38BDF8",
      mode: "light",
      font: "dm-sans",
    },
    story: {
      industry: "Performing arts / multi-venue nonprofit",
      hq: "Brooklyn, NY",
      size: "3 houses · ~40 staff · NetSuite OneWorld",
      erpName: "NetSuite (REST)",
      apiStyle: "Clean REST · minor units · Idempotency-Key · nested invoice lines",
      summary:
        "Bluebox already runs vivenu for ticketing. Finance wants every completed sale as a proper customer invoice with seat lines, cents as integers, and a stable external id. Their API looks like a textbook ERP — almost 1:1 with vivenu’s transaction shape.",
      howTheyWork: [
        "Bearer token per subsidiary",
        "POST /invoice with externalId + line items",
        "Expects amount in minor units (cents)",
        "Supports Idempotency-Key header",
        "Cancellation = credit memo with negative lines",
      ],
      painPoints: [
        "None serious on payload shape — mapping is mostly rename + nest",
        "Still need async + reconciler because webhook delivery isn’t enough",
      ],
    },
    mapping: {
      style: "clean",
      label: "NetSuite-style invoice",
      fields: [
        { source: "orderId", target: "externalId" },
        { source: "email", target: "customer.email" },
        { source: "totalCents", target: "amountCents" },
        { source: "currency", target: "currency" },
        { source: "eventTitle", target: "memo" },
        { source: "venueName", target: "location.name" },
        { source: "seats", target: "lines" },
      ],
      static: [
        { target: "type", value: "invoice" },
        { target: "subsidiary", value: "Bluebox Arts LLC" },
        { target: "source", value: "vivenu" },
      ],
    },
  },
  {
    slug: "harbor",
    name: "Harbor Live",
    tagline: "Arena nights & touring acts",
    branding: {
      brandName: "Harbor Live",
      primary: "#0F766E",
      secondary: "#F59E0B",
      mode: "dark",
      font: "space-grotesk",
    },
    story: {
      industry: "Promoter / arena operator",
      hq: "Chicago, IL",
      size: "1 arena · seasonal crew · on-prem “Ledger2009”",
      erpName: "Ledger2009 (XML-over-HTTP gateway)",
      apiStyle: "Legacy flat JSON · money as strings · seat list as CSV · weird nesting",
      summary:
        "Harbor Live bought vivenu last year but finance still posts through a 2009 gateway that expects dollar strings, uppercase refs, and a single comma-separated seat field stuffed under Batch.Txn. Their “API docs” are a Word doc from accounting. This is the messy client — recipe-driven mapping is the only sane path.",
      howTheyWork: [
        "Basic auth to an IIS reverse proxy",
        "POST /cgi/PostSale.ashx with a flat-ish JSON envelope",
        "Money must be decimal strings (\"90.00\"), not cents",
        "No idempotency header — they key on REF_NO uniqueness themselves",
        "Refunds are a different endpoint with inverted sign folklore",
      ],
      painPoints: [
        "Floats / string money — easy to drift without a transform step",
        "Seat lines flattened to CSV — loses section metadata",
        "Field names shout (AMT, REF_NO) and live under odd parents",
        "Rate limits are tribal knowledge (“don’t blast after 5pm CT”)",
      ],
    },
    mapping: {
      style: "legacy",
      label: "Ledger2009 PostSale envelope",
      fields: [
        { source: "orderId", target: "Batch.Txn.REF_NO", transform: "upper" },
        { source: "email", target: "Batch.Txn.BUYER_EMAIL" },
        { source: "totalCents", target: "Batch.Txn.AMT", transform: "dollarsString" },
        { source: "currency", target: "Batch.Txn.CUR" },
        { source: "eventTitle", target: "Batch.Txn.SHOW_NAME" },
        { source: "venueCity", target: "Batch.Txn.CITY" },
        { source: "_seats", target: "Batch.Txn.SEAT_CSV", transform: "joinLabels" },
      ],
      static: [
        { target: "Batch.Txn.SRC", value: "VIVENU" },
        { target: "Batch.Txn.POST_TYPE", value: "SALE" },
        { target: "Batch.Hdr.VER", value: "2009.4" },
        { target: "Batch.Hdr.CO_CODE", value: "HARBOR" },
      ],
    },
  },
];

export async function listClients(): Promise<CustomerProfile[]> {
  const row = await prisma.integrationConfig.findUnique({ where: { id: 3 } });
  if (row?.value && Array.isArray(row.value)) {
    return row.value as CustomerProfile[];
  }
  return CLIENTS;
}

export async function getClient(slug: string) {
  const clients = await listClients();
  return clients.find((c) => c.slug === slug) ?? null;
}

export async function activateClient(slug: string) {
  const client = await getClient(slug);
  if (!client) throw Object.assign(new Error("Client not found"), { status: 404 });
  const branding = await updateBranding(client.branding);
  await prisma.integrationConfig.upsert({
    where: { id: 4 },
    create: { id: 4, value: { activeSlug: slug } },
    update: { value: { activeSlug: slug } },
  });
  return { client, branding };
}

export async function getActiveClientSlug() {
  const row = await prisma.integrationConfig.findUnique({ where: { id: 4 } });
  const slug = (row?.value as { activeSlug?: string } | null)?.activeSlug;
  return slug ?? "bluebox";
}

export async function getActiveClient() {
  const slug = await getActiveClientSlug();
  return (await getClient(slug)) ?? CLIENTS[0];
}

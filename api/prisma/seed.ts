import { PrismaClient } from "@prisma/client";
import { CLIENTS } from "../src/config/clients.js";

const prisma = new PrismaClient();

const VENUES = [
  {
    slug: "studio-100",
    name: "Bluebox Studio",
    city: "Brooklyn",
    capacity: 100,
    rows: 10,
    cols: 10,
    description: "Intimate black-box room. Perfect for chamber works and late-night sets.",
    accent: "#1565C0",
    title: "Night Songs",
    priceCents: 4500,
    soldPattern: (r: number, c: number) => r < 2 || (r === 3 && c % 3 === 0),
  },
  {
    slug: "hall-500",
    name: "Riverfront Hall",
    city: "Boston",
    capacity: 500,
    rows: 20,
    cols: 25,
    description: "Classic proscenium hall with warm acoustics and balcony rake.",
    accent: "#0D47A1",
    title: "Symphony No. 9",
    priceCents: 8500,
    soldPattern: (r: number, c: number) => (r < 3 && c < 8) || (r === 10 && c % 4 === 0),
  },
  {
    slug: "arena-1000",
    name: "Harbor Arena",
    city: "Chicago",
    capacity: 1000,
    rows: 25,
    cols: 40,
    description: "Amphitheater bowl for touring acts. Fast gates, big sightlines.",
    accent: "#1976D2",
    title: "Open Air Finale",
    priceCents: 12000,
    soldPattern: (r: number, c: number) =>
      (r < 2 && c >= 10 && c < 30) || (r === 12 && c % 5 === 0),
  },
] as const;

function sectionFor(row: number, rows: number) {
  const t = row / rows;
  if (t < 0.35) return "Orchestra";
  if (t < 0.7) return "Mezzanine";
  return "Balcony";
}

function seatLabel(row: number, col: number) {
  return `${String.fromCharCode(65 + row)}${col + 1}`;
}

async function main() {
  await prisma.apiEventLog.deleteMany();
  await prisma.erpSync.deleteMany();
  await prisma.webhookInbox.deleteMany();
  await prisma.seat.deleteMany();
  await prisma.order.deleteMany();
  await prisma.event.deleteMany();
  await prisma.venue.deleteMany();
  await prisma.integrationConfig.deleteMany();

  await prisma.integrationConfig.create({
    data: {
      id: 1,
      value: {
        requireHmac: true,
        asyncProcessing: true,
        rateLimitEnabled: true,
        rateLimitPerMinute: 30,
        idempotencyEnabled: true,
        trustWebhookBody: false,
        erpFailPercent: 0,
        reconcilerEnabled: true,
        webhookTimeoutMs: 10000,
        holdSeconds: 60,
        holdWarnSeconds: 30,
      },
    },
  });

  await prisma.integrationConfig.create({
    data: {
      id: 2,
      value: CLIENTS[0].branding,
    },
  });

  await prisma.integrationConfig.create({
    data: {
      id: 3,
      value: CLIENTS,
    },
  });

  await prisma.integrationConfig.create({
    data: {
      id: 4,
      value: { activeSlug: "bluebox" },
    },
  });

  const starts = new Date();
  starts.setDate(starts.getDate() + 14);
  starts.setHours(19, 30, 0, 0);

  for (const v of VENUES) {
    const venue = await prisma.venue.create({
      data: {
        slug: v.slug,
        name: v.name,
        city: v.city,
        capacity: v.capacity,
        rows: v.rows,
        cols: v.cols,
        description: v.description,
        accent: v.accent,
      },
    });

    const event = await prisma.event.create({
      data: {
        venueId: venue.id,
        title: v.title,
        startsAt: starts,
        priceCents: v.priceCents,
      },
    });

    const seats: Array<{
      eventId: string;
      label: string;
      row: number;
      col: number;
      section: string;
      status: "AVAILABLE" | "SOLD";
    }> = [];

    for (let r = 0; r < v.rows; r++) {
      for (let c = 0; c < v.cols; c++) {
        seats.push({
          eventId: event.id,
          label: seatLabel(r, c),
          row: r,
          col: c,
          section: sectionFor(r, v.rows),
          status: v.soldPattern(r, c) ? "SOLD" : "AVAILABLE",
        });
      }
    }

    const sold = seats.filter((s) => s.status === "SOLD");
    const seedOrder =
      sold.length > 0
        ? await prisma.order.create({
            data: {
              eventId: event.id,
              email: "presale@demo.local",
              totalCents: sold.length * v.priceCents,
              status: "COMPLETE",
              paymentStatus: "RECEIVED",
            },
          })
        : null;

    const chunk = 500;
    for (let i = 0; i < seats.length; i += chunk) {
      const batch = seats.slice(i, i + chunk).map((s) => ({
        ...s,
        orderId: s.status === "SOLD" && seedOrder ? seedOrder.id : undefined,
      }));
      await prisma.seat.createMany({ data: batch });
    }

    console.log(`${v.slug}: ${sold.length} pre-sold / ${seats.length} total`);
  }

  console.log("Seeded venues, sold inventory, dual clients (bluebox + harbor)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

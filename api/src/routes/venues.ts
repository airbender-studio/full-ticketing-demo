import { Router } from "express";
import { prisma } from "../lib/prisma.js";

export const venuesRouter = Router();

venuesRouter.get("/", async (_req, res) => {
  const venues = await prisma.venue.findMany({
    include: {
      events: {
        take: 1,
        orderBy: { startsAt: "asc" },
        include: {
          _count: {
            select: {
              seats: true,
            },
          },
        },
      },
    },
    orderBy: { capacity: "asc" },
  });

  const withAvailability = await Promise.all(
    venues.map(async (v) => {
      const event = v.events[0];
      if (!event) return { ...v, availableSeats: 0 };
      const availableSeats = await prisma.seat.count({
        where: { eventId: event.id, status: "AVAILABLE" },
      });
      return { ...v, availableSeats };
    })
  );

  res.json(withAvailability);
});

venuesRouter.get("/:slug", async (req, res) => {
  const venue = await prisma.venue.findUnique({
    where: { slug: req.params.slug },
    include: {
      events: { take: 1, orderBy: { startsAt: "asc" } },
    },
  });
  if (!venue) return res.status(404).json({ error: "not found" });
  res.json(venue);
});

venuesRouter.get("/:slug/seats", async (req, res) => {
  const venue = await prisma.venue.findUnique({
    where: { slug: req.params.slug },
    include: { events: { take: 1 } },
  });
  if (!venue?.events[0]) return res.status(404).json({ error: "not found" });

  const seats = await prisma.seat.findMany({
    where: { eventId: venue.events[0].id },
    orderBy: [{ row: "asc" }, { col: "asc" }],
    select: {
      id: true,
      label: true,
      row: true,
      col: true,
      section: true,
      status: true,
      holdUntil: true,
    },
  });

  res.json({
    venue,
    event: venue.events[0],
    seats,
  });
});

"use server";

import { connectToDatabase } from "@/database/mongoose";
import Watchlist from "@/database/models/watchlist.model";

/**
 * Get watchlist symbols for a user by their email
 * @param email - User's email address
 * @returns Array of stock symbols from the user's watchlist
 */
export const getWatchlistSymbolsByEmail = async (
  email: string
): Promise<string[]> => {
  try {
    // Connect to database
    const mongoose = await connectToDatabase();
    const db = mongoose.connection.db;

    if (!db) {
      console.error("Database connection not found");
      return [];
    }

    // Find user by email in Better Auth user collection
    const user = await db
      .collection("user")
      .findOne({ email }, { projection: { _id: 1 } });

    if (!user || !user._id) {
      console.log(`No user found with email: ${email}`);
      return [];
    }

    const userId = user._id.toString();

    // Query watchlist by userId and return only symbols
    const watchlistItems = await Watchlist.find(
      { userId },
      { symbol: 1, _id: 0 }
    ).lean();

    // Extract symbols as strings
    const symbols = watchlistItems.map((item) => item.symbol);

    return symbols;
  } catch (error) {
    console.error("Error fetching watchlist symbols by email:", error);
    return [];
  }
};

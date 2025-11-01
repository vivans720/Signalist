import { Document, Model, model, models, Schema } from "mongoose";

export interface WatchlistItem extends Document {
  userId: string;
  symbol: string;
  company: string;
  addedAt: Date;
}

const WatchlistSchema = new Schema<WatchlistItem>(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },
    symbol: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
    },
    company: {
      type: String,
      required: true,
      trim: true,
    },
    addedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: false,
  }
);

// Create compound index on userId + symbol to prevent duplicate entries
WatchlistSchema.index({ userId: 1, symbol: 1 }, { unique: true });

const Watchlist: Model<WatchlistItem> =
  models?.Watchlist || model<WatchlistItem>("Watchlist", WatchlistSchema);

export default Watchlist;

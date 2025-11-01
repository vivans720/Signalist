import { inngest } from "@/lib/inngest/client";
import {
  PERSONALIZED_WELCOME_EMAIL_PROMPT,
  NEWS_SUMMARY_EMAIL_PROMPT,
} from "./prompts";
import { sendWelcomeEmail, sendNewsSummaryEmail } from "../nodemailer";
import { getAllUsersForNewsEmail } from "../actions/user.actions";
import { getWatchlistSymbolsByEmail } from "../actions/watchlist.actions";
import { getNews } from "../actions/finnhub.actions";
import { getFormattedTodayDate } from "../utils";

export const sendSignUpEmail = inngest.createFunction(
  { id: "sign-up-email" },
  { event: "app/user.created" },
  async ({ event, step }) => {
    const userProfile = `
            - Country: ${event.data.country}
            - Investment goals: ${event.data.investmentGoals}
            - Risk tolerance: ${event.data.riskTolerance}
            - Preferred industry: ${event.data.preferredIndustry}
        `;

    const prompt = PERSONALIZED_WELCOME_EMAIL_PROMPT.replace(
      "{{userProfile}}",
      userProfile
    );

    const response = await step.ai.infer("generate-welcome-intro", {
      model: step.ai.models.gemini({ model: "gemini-2.5-flash-lite" }),
      body: {
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }],
          },
        ],
      },
    });

    await step.run("send-welcome-email", async () => {
      const part = response.candidates?.[0]?.content?.parts?.[0];
      const introText =
        (part && "text" in part ? part.text : null) ||
        "Thanks for joining Signalist. You now have the tools to track markets and make smarter investments.";

      const {
        data: { email, name },
      } = event;

      return await sendWelcomeEmail({ email, name, intro: introText });
    });

    return {
      success: true,
      message: "Welcome email sent succesfully",
    };
  }
);

export const sendDailyNewsSummary = inngest.createFunction(
  { id: "daily-news-summary" },
  [{ event: "app/send.daily.news" }, { cron: "0 12 * * *" }],
  async ({ step }) => {
    // Step 1: Get all users for news delivery
    const users = await step.run("get-all-users", async () => {
      return await getAllUsersForNewsEmail();
    });

    if (!users || users.length === 0) {
      return { success: false, message: "No users found for news email" };
    }

    // Step 2: Fetch personalized news for each user
    const newsForUsers = await step.run("fetch-news-for-users", async () => {
      const results: Array<{
        user: User;
        news: MarketNewsArticle[];
      }> = [];

      for (const user of users) {
        try {
          // Get user's watchlist symbols
          const symbols = await getWatchlistSymbolsByEmail(user.email);

          // Fetch news (max 6 articles per user)
          const news = await getNews(symbols.length > 0 ? symbols : undefined);

          results.push({ user, news });
        } catch (error) {
          console.error(`Error fetching news for user ${user.email}:`, error);
          // Continue with empty news for this user
          results.push({ user, news: [] });
        }
      }

      return results;
    });

    // Step 3: Summarize news via AI for each user
    const summariesWithUsers: Array<{
      user: User;
      summary: string;
    }> = [];

    for (const { user, news } of newsForUsers) {
      if (news.length === 0) {
        console.log(`No news available for user ${user.email}`);
        continue;
      }

      try {
        // Prepare news data for AI
        const newsData = JSON.stringify(
          news.map((article) => ({
            headline: article.headline,
            summary: article.summary,
            source: article.source,
            url: article.url,
            category: article.category,
            related: article.related,
          })),
          null,
          2
        );

        const prompt = NEWS_SUMMARY_EMAIL_PROMPT.replace(
          "{{newsData}}",
          newsData
        );

        const response = await step.ai.infer(
          `generate-news-summary-${user.id}`,
          {
            model: step.ai.models.gemini({
              model: "gemini-2.5-flash-lite",
            }),
            body: {
              contents: [
                {
                  role: "user",
                  parts: [{ text: prompt }],
                },
              ],
            },
          }
        );

        const part = response.candidates?.[0]?.content?.parts?.[0];
        const summaryHtml =
          (part && "text" in part ? part.text : null) ||
          "<p>No news summary available at this time.</p>";

        summariesWithUsers.push({ user, summary: summaryHtml });
      } catch (error) {
        console.error(`Error summarizing news for user ${user.email}:`, error);
        // Skip this user
      }
    }

    // Step 4: Send emails
    await step.run("send-news-emails", async () => {
      const todayDate = getFormattedTodayDate();

      for (const { user, summary } of summariesWithUsers) {
        try {
          await sendNewsSummaryEmail({
            email: user.email,
            name: user.name,
            date: todayDate,
            newsContent: summary,
          });
        } catch (error) {
          console.error(`Error sending email to ${user.email}:`, error);
          // Continue with next user
        }
      }

      return { emailsSent: summariesWithUsers.length };
    });

    return {
      success: true,
      message: `Daily news summary processed for ${users.length} users`,
    };
  }
);

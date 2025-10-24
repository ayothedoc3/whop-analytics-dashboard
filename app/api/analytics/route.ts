import { whopsdk } from "@/lib/whop-sdk";
import { NextResponse } from "next/server";

const parseTimestamp = (value?: string | null): Date | null => {
  if (!value) {
    return null;
  }

  const numericValue = Number(value);

  if (Number.isFinite(numericValue)) {
    const date = new Date(numericValue * 1000);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
type PlanLike = {
  id?: string;
  renewal_price?: number | null;
  billing_period?: number | null;
  plan_type?: string | null;
};

// Helper function to calculate date ranges
const getDaysAgo = (days: number): Date => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
};

// Helper function for exponential backoff retry
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  initialDelay = 1000,
): Promise<T> {
  let lastError: Error | undefined;

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (i < maxRetries - 1) {
        const delay = initialDelay * Math.pow(2, i);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}

const parseTimestamp = (value: string | number | null | undefined): Date | null => {
  if (value === null || value === undefined) {
    return null;
  }

  const rawNumber = typeof value === "string" && value.trim() !== ""
    ? Number(value)
    : typeof value === "number"
      ? value
      : NaN;

  if (Number.isFinite(rawNumber)) {
    const milliseconds = rawNumber > 1_000_000_000_000 ? rawNumber : rawNumber * 1000;
    const fromNumber = new Date(milliseconds);
    if (!Number.isNaN(fromNumber.getTime())) {
      return fromNumber;
    }
  }

  const fromString = new Date(value as string);
  return Number.isNaN(fromString.getTime()) ? null : fromString;
};

const activeStatuses = new Set(["active", "trialing"]);

export async function GET(): Promise<Response> {
  try {
    const companyId = process.env.WHOP_COMPANY_ID;

    if (!companyId) {
      console.error("Missing WHOP_COMPANY_ID environment variable");
      return NextResponse.json(
        {
          error: "Failed to fetch analytics data",
          message: "Server configuration is missing WHOP_COMPANY_ID",
    const companyId = process.env.NEXT_PUBLIC_WHOP_COMPANY_ID;

    if (!companyId) {
      return NextResponse.json(
        {
          error: "Missing Whop configuration",
          message: "NEXT_PUBLIC_WHOP_COMPANY_ID must be set to use the analytics dashboard.",
        },
        { status: 500 },
      );
    }

    // Fetch data from Whop API with retry logic
    const [membershipsResponse, paymentsResponse, productsResponse, plansResponse] = await Promise.all([
      retryWithBackoff(() => whopsdk.memberships.list({ company_id: companyId, first: 1000 })),
      // `company_id` is not a supported filter for the payments list endpoint.
      // Fetch a page of the most recent payments without attempting to scope by company.
      retryWithBackoff(() => whopsdk.payments.list({ first: 1000 })),
      retryWithBackoff(() => whopsdk.products.list({ company_id: companyId, first: 100 })),
      retryWithBackoff(() => whopsdk.plans.list({ company_id: companyId, first: 1000 })),
      retryWithBackoff(() => whopsdk.payments.list({ company_id: companyId, first: 1000 })),
      retryWithBackoff(() => whopsdk.products.list({ company_id: companyId, first: 100 })),
      retryWithBackoff(() => whopsdk.plans.list({ company_id: companyId, first: 200 })),
    ]);

    const memberships = membershipsResponse?.data || [];
    const payments = paymentsResponse?.data || [];
    const products = productsResponse?.data || [];
    const plans = plansResponse?.data || [];

    const planMap = new Map(
      plans.map((plan) => [
        plan.id,
        {
          renewalPrice: Number(plan.renewal_price ?? 0),
          billingPeriodDays: plan.billing_period != null ? Number(plan.billing_period) : null,
          planType: plan.plan_type,
        },
      ]),
    );
    const planMap = new Map<string, PlanLike>();
    plans.forEach((plan) => {
      if (plan?.id) {
        planMap.set(plan.id, plan as PlanLike);
      }
    });

    // Date calculations
    const now = new Date();
    const thirtyDaysAgo = getDaysAgo(30);

    // Filter active subscriptions
    const activeMemberships = memberships.filter(
      (membership) => membership.status === "active" || membership.status === "trialing",
    );
    const ninetyDaysAgo = getDaysAgo(90);

    // Filter active memberships
    const activeMemberships = memberships.filter((membership) => activeStatuses.has(membership.status));

    const getCycleLengthInDays = (membership: (typeof memberships)[number]): number | null => {
      const start = parseTimestamp(membership.renewal_period_start);
      const end = parseTimestamp(membership.renewal_period_end);

      if (start && end) {
        const diff = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
        if (diff > 0) {
          return diff;
        }
      }

      const planDetails = membership.plan?.id ? planMap.get(membership.plan.id) : undefined;
      if (planDetails?.billingPeriodDays && planDetails.billingPeriodDays > 0) {
        return planDetails.billingPeriodDays;
      }

      return null;
    };

    // Calculate MRR (Monthly Recurring Revenue)
    // Sum of all active recurring subscription prices
    const mrr = activeMemberships.reduce((sum, membership) => {
      if (!membership.plan?.id) {
        return sum;
      }

      const planDetails = planMap.get(membership.plan.id);
      if (!planDetails || planDetails.planType !== "renewal") {
        return sum;
      }

      const renewalPrice = planDetails.renewalPrice;
      if (!renewalPrice) {
        return sum;
      }

      const cycleDays = getCycleLengthInDays(membership) ?? 30;
      const monthlyPrice = cycleDays > 0 ? renewalPrice * (30 / cycleDays) : renewalPrice;
    // Sum of all active recurring membership prices
    const mrrCents = activeMemberships.reduce((sum, membership) => {
      const planId = membership.plan?.id;
      const fallbackPlan = membership.plan as PlanLike | null;
      const planDetails = planId ? planMap.get(planId) : undefined;
      const plan = {
        ...(fallbackPlan ?? {}),
        ...(planDetails ?? {}),
      } satisfies PlanLike;

      if (plan.plan_type !== "renewal") {
        return sum;
      }

      const renewalPrice = plan.renewal_price ?? 0;
      const billingPeriod = plan.billing_period && plan.billing_period > 0 ? plan.billing_period : 1;
      const monthlyPrice = renewalPrice / billingPeriod;

      return sum + monthlyPrice;
    }, 0);

    // Calculate new subscriptions in last 30 days
    const newSubscriptions = memberships.filter((membership) => {
      const createdAt = parseTimestamp(membership.created_at);
      if (!createdAt) {
        return false;
      }
      return createdAt >= thirtyDaysAgo && createdAt <= now;
      return createdAt && createdAt >= thirtyDaysAgo && createdAt <= now;
    }).length;

    // Calculate churn rate
    // Churn = (Cancelled subscriptions in last 30 days / Total active 30 days ago) * 100
    const subscribersThirtyDaysAgo = memberships.filter((membership) => {
      const createdAt = parseTimestamp(membership.created_at);
      if (!createdAt) {
        return false;
      }
      return createdAt <= thirtyDaysAgo;
      const cancelledAt = parseTimestamp(membership.canceled_at);

      if (!createdAt || createdAt > thirtyDaysAgo) {
        return false;
      }

      if (cancelledAt && cancelledAt <= thirtyDaysAgo) {
        return false;
      }

      return true;
    }).length;

    const cancelledInLast30Days = memberships.filter((membership) => {
      const cancelledAt = parseTimestamp(membership.canceled_at);
      return (
        cancelledAt &&
        cancelledAt >= thirtyDaysAgo &&
        cancelledAt <= now &&
        (membership.status === "canceled" || membership.status === "past_due")
      );
      return cancelledAt && cancelledAt >= thirtyDaysAgo && cancelledAt <= now;
    }).length;

    const churnRate = subscribersThirtyDaysAgo > 0
      ? (cancelledInLast30Days / subscribersThirtyDaysAgo) * 100
      : 0;

    // Calculate revenue trend for last 90 days (grouped by day)
    const revenueTrend: { date: string; revenue: number }[] = [];
    const revenueByDay = new Map<string, number>();

    payments.forEach((payment) => {
      const paymentDate = parseTimestamp(payment.created_at);
      if (!paymentDate) {
        return;
      }

      if (paymentDate < ninetyDaysAgo || paymentDate > now) {
        return;
      }

      const dailyRevenue = payments
        .filter((payment) => {
          const paymentDate = parseTimestamp(payment.created_at);
          return paymentDate?.toISOString().split("T")[0] === dateStr;
        })
        .reduce((sum, payment) => {
          const total = Number(payment.total ?? payment.usd_total ?? 0);
          return sum + total;
        }, 0);
      const dateKey = paymentDate.toISOString().split("T")[0];
      const current = revenueByDay.get(dateKey) ?? 0;
      const paymentTotal = payment.usd_total ?? payment.total ?? payment.subtotal ?? 0;
      revenueByDay.set(dateKey, current + paymentTotal);
    });

    for (let i = 89; i >= 0; i--) {
      const date = getDaysAgo(i);
      const dateKey = date.toISOString().split("T")[0];
      const dailyRevenue = revenueByDay.get(dateKey) ?? 0;
      revenueTrend.push({
        date: dateKey,
        revenue: dailyRevenue / 100,
      });
    }

    // Calculate top 5 products by revenue (last 30 days)
    const productRevenueMap = new Map<string, { name: string; revenue: number }>();

    payments
      .filter((payment) => {
        const paymentDate = parseTimestamp(payment.created_at);
        return paymentDate && paymentDate >= thirtyDaysAgo && paymentDate <= now;
      })
      .forEach((payment) => {
        const productId = payment.product?.id ?? null;
        if (!productId) {
          return;
        const productId = payment.product?.id;
        if (productId) {
          const existing = productRevenueMap.get(productId);
          const paymentTotal = payment.usd_total ?? payment.total ?? payment.subtotal ?? 0;
          const revenue = paymentTotal / 100; // Convert cents to dollars

          if (existing) {
            existing.revenue += revenue;
          } else {
            const product = products.find((p) => p.id === productId);
            productRevenueMap.set(productId, {
              name: product?.title || `Product ${productId}`,
              revenue: revenue,
            });
          }
        }

        const revenueCents = Number(payment.total ?? payment.usd_total ?? 0);
        const revenue = revenueCents / 100;

        const existing = productRevenueMap.get(productId);
        if (existing) {
          existing.revenue += revenue;
          return;
        }

        const product = products.find((p) => p.id === productId);
        productRevenueMap.set(productId, {
          name: product?.title || `Product ${productId}`,
          revenue,
        });
      });

    // Sort and get top 5
    const topProducts = Array.from(productRevenueMap.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);

    // Return analytics data
    return NextResponse.json({
      metrics: {
        mrr: Math.round(mrrCents) / 100, // Convert cents to dollars
        churnRate: Math.round(churnRate * 100) / 100, // Round to 2 decimal places
        newSubscriptions,
        totalActiveSubscribers: activeMemberships.length,
      },
      revenueTrend,
      topProducts,
    });

  } catch (error) {
    console.error("Error fetching analytics data:", error);

    // Return appropriate error response
    return NextResponse.json(
      {
        error: "Failed to fetch analytics data",
        message: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}

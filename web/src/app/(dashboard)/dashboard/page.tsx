import Link from "next/link";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function DashboardPage() {
  const session = await auth();
  const userId = session!.user!.id;

  const [providerCount, campaignCount] = await Promise.all([
    prisma.providerAccount.count({
      where: { userId, status: "active" },
    }),
    prisma.campaign.count({ where: { userId } }),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">
          Welcome{session!.user!.name ? `, ${session!.user!.name}` : ""} 👋
        </h1>
        <p className="text-muted-foreground">
          Brew your next outreach — or pick up where you left off.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>Connected inboxes</CardDescription>
            <CardTitle className="text-4xl">{providerCount}</CardTitle>
          </CardHeader>
          <CardContent>
            {providerCount === 0 ? (
              <Button asChild size="sm" variant="accent">
                <Link href="/settings">Connect Gmail</Link>
              </Button>
            ) : (
              <Button asChild size="sm" variant="outline">
                <Link href="/settings">Manage</Link>
              </Button>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription>Projects</CardDescription>
            <CardTitle className="text-4xl">{campaignCount}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <Button asChild size="sm" variant="accent">
              <Link href="/campaigns#projects">New project</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/campaigns#projects">View all projects</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription>Monthly drafts remaining</CardDescription>
            <CardTitle className="text-4xl">10</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              Free plan during beta. See limits &amp; future paid tiers in the{" "}
              <Link href="/pricing#plans" className="font-medium text-foreground underline">
                pricing guide
              </Link>
              .
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Getting started</CardTitle>
          <CardDescription>
            Open a project to brief, add recipients, generate drafts, and save or
            send from Gmail.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <Link href="/campaigns#projects">Go to projects</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

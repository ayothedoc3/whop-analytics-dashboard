import { Button } from "@whop/react/components";
import Link from "next/link";

export default function Page() {
  return (
    <div className="py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto rounded-3xl bg-gray-a2 p-6 sm:p-10 border border-gray-a4">
        <div className="text-center mt-4 sm:mt-8 mb-8 sm:mb-12">
          <h1 className="text-7 sm:text-8 font-bold text-gray-12 mb-4">
            Welcome to Your Whop App
          </h1>
          <p className="text-4 text-gray-11">
            Jump into the revenue analytics dashboard or explore the developer
            documentation to continue customizing your experience.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-4">
          <Link href="/analytics" className="w-full">
            <Button variant="classic" className="w-full" size="4">
              View Revenue Analytics
            </Button>
          </Link>
          <Link
            href="https://docs.whop.com/apps"
            className="w-full"
            target="_blank"
          >
            <Button variant="ghost" className="w-full" size="4">
              Developer Docs
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

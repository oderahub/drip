import { CreateStreamWizard } from "@/components/create-stream/wizard";
import { Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export const metadata = {
  title: "Create a stream",
};

export default function NewStreamPage() {
  return (
    <div className="container py-10 sm:py-14">
      <div className="mx-auto mb-8 max-w-2xl text-center">
        <Badge variant="default" className="mb-3 gap-1.5">
          <Sparkles className="h-3.5 w-3.5" />
          New stream
        </Badge>
        <h1 className="text-balance text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">
          Open a stream. Hand off the watch to an agent.
        </h1>
        <p className="mt-2 text-pretty text-sm leading-relaxed text-muted-foreground">
          Two on-chain transactions. The first opens the stream; the second registers the
          activity policy. You can skip the policy and just do the stream — or come back later
          and add one.
        </p>
      </div>

      <div className="mx-auto max-w-2xl">
        <CreateStreamWizard />
      </div>
    </div>
  );
}

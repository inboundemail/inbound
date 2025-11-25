"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import ChatBubble2 from "@/components/icons/chat-bubble-2";
import PaperPlane2 from "@/components/icons/paper-plane-2";
import { sendFeedbackAction } from "@/app/actions/feedback";
import { useSession } from "@/lib/auth/auth-client";
import { toast } from "sonner";

export function FeedbackButton() {
  const [isOpen, setIsOpen] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { data: session } = useSession();

  const handleSubmit = async () => {
    if (!feedback.trim()) {
      toast.error("Please enter your feedback");
      return;
    }

    if (!session?.user) {
      toast.error("Please sign in to submit feedback");
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await sendFeedbackAction({ feedback: feedback.trim() });
      if (result.success) {
        toast.success("Thank you for your feedback!");
        setFeedback("");
        setIsOpen(false);
      } else {
        toast.error(result.error || "Failed to send feedback");
      }
    } catch (error) {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    setFeedback("");
    setIsOpen(false);
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="primary"
          className="rounded-full gap-2 px-4 h-9"
        >
          <ChatBubble2 width={14} height={14} />
          <span className="hidden sm:inline">Feedback</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-80 p-0"
      >
        <div className="p-4">
          <h3 className="font-semibold text-base mb-1">Share Your Feedback</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Help us improve by sharing your thoughts
          </p>
          <Textarea
            placeholder="Please enter your feedback in the form of a cursor prompt"
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            className="min-h-[120px] resize-none mb-4"
            disabled={isSubmitting}
          />
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="secondary"
              onClick={handleCancel}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleSubmit}
              disabled={isSubmitting || !feedback.trim()}
              className="gap-2"
            >
              <PaperPlane2 width={14} height={14} />
              {isSubmitting ? "Sending..." : "Submit"}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

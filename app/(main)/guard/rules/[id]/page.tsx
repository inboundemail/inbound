"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

const Editor = dynamic(() => import("@monaco-editor/react"), { ssr: false });
import {
  useGuardRuleQuery,
  useUpdateGuardRuleMutation,
  useDeleteGuardRuleMutation,
  useGuardRuleCheckMutation,
} from "@/features/guard/hooks/useGuardHooks";
import type {
  ExplicitRuleConfig,
  AiPromptRuleConfig,
  LogicOperator,
  RuleActionConfig,
  CheckRuleMatchResponse,
} from "@/features/guard/types";
import { format } from "date-fns";
import { toast } from "sonner";

// Import icons
import ArrowBoldLeft from "@/components/icons/arrow-bold-left";
import CirclePlus from "@/components/icons/circle-plus";
import Code2 from "@/components/icons/code-2";
import BoltLightning from "@/components/icons/bolt-lightning";
import Trash2 from "@/components/icons/trash-2";
import SidebarToggleButton from "@/components/sidebar-toggle-button";
import CircleCheck from "@/components/icons/circle-check";
import CircleXmark from "@/components/icons/circle-xmark";
import { ApiIdLabel } from "@/components/api-id-label";
import { useGuardRulesQuery } from "@/features/guard/hooks/useGuardHooks";
import { DeleteConfirmationDialog } from "@/components/ui/delete-confirmation-dialog";
import { useQuery } from "@tanstack/react-query";
import { client, getEdenErrorMessage } from "@/lib/api/client";
import { EndpointSelector } from "@/components/endpoints";

export default function GuardRuleDetailPage() {
  const params = useParams();
  const router = useRouter();
  const ruleId = params.id as string;

  const { data: rule, isLoading, error } = useGuardRuleQuery(ruleId);
  const { data: rulesList } = useGuardRulesQuery({ limit: 1000 });
  const updateMutation = useUpdateGuardRuleMutation();
  const deleteMutation = useDeleteGuardRuleMutation();
  const checkMutation = useGuardRuleCheckMutation();

  // Form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState(0);
  const [isActive, setIsActive] = useState(true);
  const [config, setConfig] = useState<
    ExplicitRuleConfig | AiPromptRuleConfig | null
  >(null);
  const [configText, setConfigText] = useState("");
  const [configError, setConfigError] = useState("");
  const [actionConfig, setActionConfig] = useState<RuleActionConfig | null>(
    null
  );
   const [actionType, setActionType] = useState<'allow' | 'block' | 'route'>(
     'allow'
   );
   const [routeEndpointId, setRouteEndpointId] = useState<string>("");

  // Test state
  const [testEmailId, setTestEmailId] = useState("");
  const [testResult, setTestResult] = useState<CheckRuleMatchResponse | null>(
    null
  );
  const [testedEmailId, setTestedEmailId] = useState<string | null>(null);

  // Delete confirmation
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  // Load rule data
  useEffect(() => {
    if (rule) {
      setName(rule.name);
      setDescription(rule.description || "");
      setPriority(rule.priority || 0);
      setIsActive(rule.isActive || true);
      
      try {
        const parsedConfig = JSON.parse(rule.config);
        setConfig(parsedConfig);
        setConfigText(JSON.stringify(parsedConfig, null, 2));
        setConfigError("");
      } catch (e) {
        console.error("Failed to parse config:", e);
        setConfigText(rule.config);
        setConfigError("Invalid JSON in stored config");
      }

      try {
        if (rule.actions) {
          setActionConfig(JSON.parse(rule.actions));
           const parsedAction = JSON.parse(rule.actions) as RuleActionConfig;
           setActionType(parsedAction.action);
           if (parsedAction.action === 'route') {
             setRouteEndpointId(parsedAction.endpointId || "");
           } else {
             setRouteEndpointId("");
           }
        }
      } catch (e) {
        console.error("Failed to parse actions:", e);
      }
    }
  }, [rule]);

  const handleConfigChange = (value: string) => {
    setConfigText(value);
    try {
      const parsed = JSON.parse(value);
      
      // Validate schema structure based on rule type
      if (rule?.type === "explicit") {
        // Check for valid explicit rule config structure
        const hasValidStructure = 
          typeof parsed === "object" &&
          (parsed.subject === undefined ||
            (typeof parsed.subject === "object" &&
              Array.isArray(parsed.subject.values))) &&
          (parsed.from === undefined ||
            (typeof parsed.from === "object" &&
              Array.isArray(parsed.from.values))) &&
          (parsed.to === undefined ||
            (typeof parsed.to === "object" &&
              Array.isArray(parsed.to.values))) &&
          (parsed.hasAttachment === undefined ||
            typeof parsed.hasAttachment === "boolean") &&
          (parsed.hasWords === undefined ||
            (typeof parsed.hasWords === "object" &&
              Array.isArray(parsed.hasWords.values)));
        
        if (!hasValidStructure) {
          setConfigError("Invalid explicit rule configuration structure");
          return;
        }
      } else if (rule?.type === "ai_prompt") {
        // Check for valid AI prompt rule config structure
        if (typeof parsed !== "object" || typeof parsed.prompt !== "string") {
          setConfigError("Invalid AI prompt rule configuration structure");
          return;
        }
      }
      
      setConfig(parsed);
      setConfigError("");
    } catch (e) {
      setConfigError("Invalid JSON syntax");
    }
  };

  const handleSave = async () => {
    if (!rule || !config) return;

    if (configError) {
      toast.error("Please fix JSON errors before saving");
      return;
    }

    try {
      const finalAction: RuleActionConfig =
        actionType === 'route'
          ? { action: 'route', endpointId: routeEndpointId }
          : { action: actionType };

      await updateMutation.mutateAsync({
        ruleId: rule.id,
        data: {
          name,
          description: description || undefined,
          priority,
          isActive,
          config,
          action: finalAction, // Save selected action
        },
      });
    } catch (error) {
      // Error toast is already shown by mutation onError handler
      console.error("Failed to update guard rule:", error);
    }
  };

  const handleDelete = async () => {
    if (!rule) return;

    try {
      await deleteMutation.mutateAsync(rule.id);
      router.push("/guard");
    } catch (error) {
      // Error handled by mutation
    }
  };

  const handleTest = async () => {
    if (!testEmailId.trim()) {
      toast.error("Please enter an email ID to test");
      return;
    }

    try {
      const result = await checkMutation.mutateAsync({
        ruleId,
        data: { structuredEmailId: testEmailId },
      });
      setTestedEmailId(testEmailId);
      setTestResult(result);
    } catch (error) {
      setTestResult({
        matched: false,
        error: error instanceof Error ? error.message : "Test failed",
      });
    }
  };

  const handleTestEmail = async (emailId: string) => {
    setTestEmailId(emailId);
    setTestedEmailId(emailId);
    try {
      const result = await checkMutation.mutateAsync({
        ruleId,
        data: { structuredEmailId: emailId },
      });
      setTestResult(result);
    } catch (error) {
      setTestResult({
        matched: false,
        error: error instanceof Error ? error.message : "Test failed",
      });
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen p-4">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center justify-center py-20">
            <div className="text-muted-foreground">Loading rule...</div>
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (error || !rule) {
    return (
      <div className="min-h-screen p-4">
        <div className="max-w-3xl mx-auto">
          <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-6">
            <div className="flex items-center gap-2 text-destructive">
              <CircleXmark width="16" height="16" />
              <span>{error?.message || "Rule not found"}</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const RuleIcon = rule.type === "explicit" ? Code2 : BoltLightning;
  const iconColor = rule.type === "explicit" ? "#3b82f6" : "#8b5cf6";
  const existingRules = rulesList?.data || [];
  const activeRules = existingRules.filter((r) => r.isActive);
  const higherCount = activeRules.filter(
    (r) => (r.priority ?? 0) > (rule.priority ?? 0)
  ).length;
  const samePriorityEarlier = activeRules
    .filter((r) => (r.priority ?? 0) === (rule.priority ?? 0))
    .sort((a, b) => (b.createdAt as any) - (a.createdAt as any));
  const position = higherCount + 1;

  return (
    <div className="min-h-screen p-4">
      <div className="max-w-3xl mx-auto px-2">
        {/* Back Button */}
        <div className="flex items-center mb-6">
          <Link
            href="/guard"
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowBoldLeft width="16" height="16" />
            Back to Guard Rules
          </Link>
        </div>

        {/* Header */}
        <div className="mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-md bg-muted">
              <RuleIcon width="28" height="28" style={{ color: iconColor }} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-semibold tracking-tight truncate">
                  {rule.name}
                </h2>
                <Badge
                  variant={rule.type === "explicit" ? "secondary" : "default"}
                >
                  {rule.type === "explicit" ? "Explicit" : "AI"}
                </Badge>
                <Badge variant={rule.isActive ? "default" : "secondary"}>
                  {rule.isActive ? "Active" : "Inactive"}
                </Badge>
                {actionConfig && (
                  <Badge variant="outline">
                    {actionConfig.action.toUpperCase()}
                  </Badge>
                )}
              </div>
              <ApiIdLabel id={rule.id} size="sm" />
            </div>
          </div>
        </div>

        {/* Metadata */}
        <div className="mb-6 grid grid-cols-3 gap-3 text-sm">
          <div className="p-3 rounded-md border">
            <div className="text-muted-foreground mb-1">Created</div>
            <div className="font-medium">
              {rule.createdAt
                ? format(new Date(rule.createdAt), "MMM d, yyyy")
                : "N/A"}
            </div>
          </div>
          <div className="p-3 rounded-md border">
            <div className="text-muted-foreground mb-1">Triggers</div>
            <div className="font-medium">{rule.triggerCount || 0}</div>
          </div>
          <div className="p-3 rounded-md border">
            <div className="text-muted-foreground mb-1">Last Triggered</div>
            <div className="font-medium">
              {rule.lastTriggeredAt
                ? format(new Date(rule.lastTriggeredAt), "MMM d, yyyy")
                : "Never"}
            </div>
          </div>
        </div>

        {/* Evaluation Order */}
        <div className="mb-6">
          <div className="p-3 rounded-md border text-sm">
            <div className="text-muted-foreground mb-1">Evaluation order</div>
            <div className="font-medium">
              Priority {rule.priority} · Evaluated{" "}
              {position === 1
                ? "1st"
                : position === 2
                  ? "2nd"
                  : position === 3
                    ? "3rd"
                    : `${position}th`}{" "}
              among {activeRules.length} active rules
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              Rules are sorted by priority (highest first). Ties are evaluated
              from newest to oldest.
            </div>
          </div>
        </div>

        {/* Form */}
        <div className="space-y-8">
          {/* Basic Info */}
          <section className="space-y-4">
            <h3 className="text-sm font-medium text-muted-foreground">
              Basic information
            </h3>
            <div>
              <Label htmlFor="name">Rule Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="priority">Priority</Label>
                <Input
                  id="priority"
                  type="number"
                  min={0}
                  value={priority}
                  onChange={(e) =>
                    setPriority(Math.max(0, parseInt(e.target.value) || 0))
                  }
                />
              </div>
              <div>
                <Label>Status</Label>
                <div className="mt-1">
                  <ToggleGroup
                    type="single"
                    value={isActive ? "active" : "inactive"}
                    onValueChange={(v) => {
                      if (v === "active" || v === "inactive") {
                        setIsActive(v === "active");
                  }
                    }}
                    className="flex items-center gap-2 justify-start"
                  >
                    <ToggleGroupItem
                      value="active"
                      className="h-8 rounded-full px-4 border data-[state=on]:bg-primary data-[state=on]:text-white"
                    >
                      Active
                    </ToggleGroupItem>
                    <ToggleGroupItem
                      value="inactive"
                      className="h-8 rounded-full px-4 border data-[state=on]:bg-primary data-[state=on]:text-white"
                    >
                      Inactive
                    </ToggleGroupItem>
                </ToggleGroup>
                </div>
              </div>
            </div>
          </section>

          {/* Action Configuration */}
          {/* Action Configuration (editable) */}
            <section className="space-y-2">
            <h3 className="text-sm font-medium text-muted-foreground">
              Action
            </h3>
              <div className="flex items-center gap-2">
              <ToggleGroup
                type="single"
                value={actionType}
                onValueChange={(v) => {
                  if (v === 'allow' || v === 'block' || v === 'route') {
                    setActionType(v);
                    if (v !== 'route') {
                      setRouteEndpointId("");
                      setActionConfig({ action: v });
                    } else {
                      setActionConfig(
                        routeEndpointId
                          ? { action: 'route', endpointId: routeEndpointId }
                          : { action: 'route', endpointId: "" as any }
                      );
                    }
                  }
                }}
                className="flex items-center gap-2 justify-start"
              >
                <ToggleGroupItem value="allow" className="h-8 rounded-full px-4 border data-[state=on]:bg-primary data-[state=on]:text-white">Allow</ToggleGroupItem>
                <ToggleGroupItem value="block" className="h-8 rounded-full px-4 border data-[state=on]:bg-primary data-[state=on]:text-white">Block</ToggleGroupItem>
                <ToggleGroupItem value="route" className="h-8 rounded-full px-4 border data-[state=on]:bg-primary data-[state=on]:text-white">Route</ToggleGroupItem>
              </ToggleGroup>
            </div>
            {actionType === 'route' && (
              <div className="space-y-2">
                <Label>Choose endpoint</Label>
                <EndpointSelector
                  value={routeEndpointId || null}
                  onChange={(id) => {
                    setRouteEndpointId(id || "");
                    setActionConfig({ action: 'route', endpointId: id || "" });
                  }}
                  placeholder="Select an endpoint..."
                  filterActive={true}
                />
                {routeEndpointId && (
                  <div className="text-xs text-muted-foreground font-mono">{routeEndpointId}</div>
                )}
              </div>
            )}
            </section>

          {/* Rule Configuration */}
          <section className="space-y-2">
            <h3 className="text-sm font-medium text-muted-foreground">
              Rule configuration
            </h3>
            <div
              className={`border rounded-md overflow-hidden ${configError ? "border-destructive" : ""}`}
            >
              <Editor
                height="300px"
                defaultLanguage="json"
                value={configText}
                onChange={(value) => handleConfigChange(value || "")}
                theme="dark"
                options={{
                  minimap: { enabled: false },
                  fontSize: 13,
                  lineNumbers: "on",
                  automaticLayout: true,
                  tabSize: 2,
                  formatOnPaste: true,
                  formatOnType: true,
                }}
              />
            </div>
            {configError && (
              <p className="text-sm text-destructive">{configError}</p>
            )}
          </section>

          {/* Test Section */}
          <section className="space-y-4">
            <h3 className="text-sm font-medium text-muted-foreground">
              Test rule
            </h3>
            <div className="flex gap-2">
              <Input
                placeholder="Enter structured email ID..."
                value={testEmailId}
                onChange={(e) => setTestEmailId(e.target.value)}
              />
              <Button onClick={handleTest} disabled={checkMutation.isPending}>
                {checkMutation.isPending ? "Testing..." : "Test"}
              </Button>
            </div>

            {/* Recent inbound emails */}
            <div className="space-y-2">
              <div className="text-xs text-muted-foreground">
                Recent inbound emails
              </div>
            {testResult && (
                <div
                  className={`p-4 rounded-md border ${
                testResult.matched
                      ? "bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-800"
                      : "bg-red-50 border-red-200 dark:bg-red-950 dark:border-red-800"
                  }`}
                >
                <div className="flex items-center gap-2 mb-2">
                  {testResult.matched ? (
                    <>
                        <CircleCheck
                          width="20"
                          height="20"
                          className="text-green-600"
                        />
                        <span className="font-semibold text-green-600">
                          Rule Matched!
                        </span>
                    </>
                  ) : (
                    <>
                        <CircleXmark
                          width="20"
                          height="20"
                          className="text-red-600"
                        />
                        <span className="font-semibold text-red-600">
                          No Match
                        </span>
                    </>
                  )}
                </div>

                  {"error" in testResult && (testResult as any).error && (
                    <p className="text-sm text-muted-foreground">
                      Error: {testResult.error}
                    </p>
                )}

                  {"reason" in testResult && (testResult as any).reason && (
                    <p className="text-sm text-muted-foreground">
                      Reason: {(testResult as any).reason}
                    </p>
                  )}

                  {"matchDetails" in testResult &&
                    (testResult as any).matchDetails &&
                    (testResult as any).matchDetails.length > 0 && (
                  <div className="mt-2">
                        <p className="text-sm font-medium mb-1">
                          Match Details:
                        </p>
                    <ul className="list-disc list-inside text-sm space-y-1">
                          {(testResult as any).matchDetails.map(
                            (detail: any, i: number) => (
                        <li key={i}>
                                <span className="font-medium">
                                  {detail.criteria}:
                                </span>{" "}
                                {detail.value}
                        </li>
                            )
                          )}
                    </ul>
                      </div>
                    )}

                  {actionConfig && testResult?.matched && (
                    <div className="mt-3 text-sm">
                      <span className="text-muted-foreground">
                        Action if matched:{" "}
                      </span>
                      <span className="font-medium">
                        {actionConfig.action === "route" &&
                        actionConfig.endpointId
                          ? `ROUTE → ${actionConfig.endpointId}`
                          : actionConfig.action.toUpperCase()}
                      </span>
                  </div>
                )}
              </div>
            )}
              <RecentEmailsList
                onTest={handleTestEmail}
                isTesting={checkMutation.isPending}
                testedEmailId={testedEmailId}
                testResult={testResult}
                actionConfig={actionConfig}
              />
            </div>
          </section>

          {/* Actions */}
          <div className="flex items-center justify-between">
            <Button
              variant="destructive"
              onClick={() => setShowDeleteDialog(true)}
            >
              <Trash2 width="16" height="16" className="mr-2" />
              Delete Rule
            </Button>

            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => router.push("/guard")}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={updateMutation.isPending}>
                {updateMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </div>
        </div>

        {/* Delete Confirmation Dialog */}
        <DeleteConfirmationDialog
          open={showDeleteDialog}
          onOpenChange={setShowDeleteDialog}
          onConfirm={handleDelete}
          title="Delete Guard Rule"
          itemName={rule.name}
          itemType="guard rule"
          isLoading={deleteMutation.isPending}
        />
      </div>
    </div>
  );
}

function RecentEmailsList({
  onTest,
  isTesting,
  testedEmailId,
  testResult,
  actionConfig,
}: {
  onTest: (emailId: string) => void;
  isTesting: boolean;
  testedEmailId: string | null;
  testResult: CheckRuleMatchResponse | null;
  actionConfig: RuleActionConfig | null;
}) {
  const { data: emails, isLoading, error } = useQuery({
    queryKey: ["guard", "recent-received-emails"],
    queryFn: async () => {
      const { data, error } = await client.api.e2.emails.get({
        query: { type: "received", limit: "5" },
      });
      if (error) {
        throw new Error(getEdenErrorMessage(error, "Failed to fetch recent emails"));
      }
      return data?.data ?? [];
    },
    staleTime: 30 * 1000,
  });

  if (isLoading) {
    return (
      <div className="text-xs text-muted-foreground">
        Loading recent emails…
      </div>
    );
  }

  if (error || !emails?.length) {
    return (
      <div className="text-xs text-muted-foreground">
        No recent emails found.
      </div>
    );
  }

  return (
    <ul className="divide-y border rounded-md">
      {emails.map((email) => {
        const isTested = testedEmailId === email.id;
        const testedState = isTested && testResult;
        return (
          <li key={email.id} className="p-3 flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium truncate">
                  {email.from_name || email.from}
                </span>
                <span className="text-xs text-muted-foreground truncate">
                  {email.from_name ? `<${email.from}>` : ""}
                </span>
              </div>
              <div className="text-sm truncate">
                {email.subject || "(no subject)"}
              </div>
              <div className="text-[11px] text-muted-foreground font-mono truncate">
                {email.id}
              </div>
            </div>
            {testedState && (
              <div
                className={`text-xs ${testedState.matched ? "text-green-600" : "text-red-600"}`}
              >
                {testedState.matched ? "Matched" : "No match"}
              </div>
            )}
            <Button onClick={() => onTest(email.id)} disabled={isTesting}>
              {isTesting && testedEmailId === email.id ? "Testing…" : "Test"}
            </Button>
          </li>
        );
      })}
    </ul>
  );
}

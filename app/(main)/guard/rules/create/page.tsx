"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  useCreateGuardRuleMutation,
  useGuardRulesQuery,
} from "@/features/guard/hooks/useGuardHooks";
import { EndpointSelector } from "@/components/endpoints";
import type {
  ExplicitRuleConfig,
  AiPromptRuleConfig,
  LogicOperator,
  RuleAction,
  RuleActionConfig,
} from "@/features/guard/types";

// Import icons
import ArrowBoldLeft from "@/components/icons/arrow-bold-left";
import CirclePlus from "@/components/icons/circle-plus";
import Code2 from "@/components/icons/code-2";
import BoltLightning from "@/components/icons/bolt-lightning";
import Trash2 from "@/components/icons/trash-2";
import SidebarToggleButton from "@/components/sidebar-toggle-button";
import { Badge } from "@/components/ui/badge";

export default function CreateGuardRulePage() {
  const router = useRouter();
  const createMutation = useCreateGuardRuleMutation();
  const { data: rulesList } = useGuardRulesQuery({ limit: 1000 });

  // Basic form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [ruleType, setRuleType] = useState<"explicit" | "ai_prompt">(
    "explicit"
  );
  const [priority, setPriority] = useState(0);

  // Action state
  const [action, setAction] = useState<RuleAction>("allow");
  const [routeEndpointId, setRouteEndpointId] = useState<string>("");

  // Explicit rule state
  const [subjectOperator, setSubjectOperator] = useState<LogicOperator>("OR");
  const [subjectValues, setSubjectValues] = useState<string[]>([""]);
  const [fromOperator, setFromOperator] = useState<LogicOperator>("OR");
  const [fromValues, setFromValues] = useState<string[]>([""]);
  const [toOperator, setToOperator] = useState<LogicOperator>("OR");
  const [toValues, setToValues] = useState<string[]>([""]);
  const [hasAttachment, setHasAttachment] = useState<boolean | undefined>(
    undefined
  );
  const [wordsOperator, setWordsOperator] = useState<LogicOperator>("OR");
  const [wordsValues, setWordsValues] = useState<string[]>([""]);

  // AI evaluated state
  const [aiPrompt, setAiPrompt] = useState("If the email is ");

  // Validation
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleAddValue = (
    values: string[],
    setter: React.Dispatch<React.SetStateAction<string[]>>
  ) => {
    setter([...values, ""]);
  };

  const handleRemoveValue = (
    index: number,
    values: string[],
    setter: React.Dispatch<React.SetStateAction<string[]>>
  ) => {
    if (values.length > 1) {
      setter(values.filter((_, i) => i !== index));
    }
  };

  const handleValueChange = (
    index: number,
    value: string,
    values: string[],
    setter: React.Dispatch<React.SetStateAction<string[]>>
  ) => {
    const newValues = [...values];
    newValues[index] = value;
    setter(newValues);
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    // Validate name
    if (!name.trim()) {
      newErrors.name = "Rule name is required";
    } else if (name.trim().length < 3) {
      newErrors.name = "Rule name must be at least 3 characters";
    }

    // Validate priority
    if (priority < 0) {
      newErrors.priority = "Priority cannot be negative";
    }

    // Validate action
    if (action === "route" && !routeEndpointId) {
      newErrors.action = "Please select an endpoint for routing";
    }

    if (ruleType === "explicit") {
      // Check if any meaningful criteria is configured
      // Note: hasAttachment can be true, false, or undefined
      // We need to check explicitly for boolean values, not just truthiness
      const hasSubject = subjectValues.some((v) => v.trim());
      const hasFrom = fromValues.some((v) => v.trim());
      const hasTo = toValues.some((v) => v.trim());
      const hasAttachmentCriteria = typeof hasAttachment === "boolean";
      const hasWords = wordsValues.some((v) => v.trim());

      const hasAnyConfig =
        hasSubject || hasFrom || hasTo || hasAttachmentCriteria || hasWords;

      if (!hasAnyConfig) {
        newErrors.config =
          "At least one criteria must be configured (subject, from, to, attachment, or words)";
      }
    } else {
      if (!aiPrompt.trim()) {
        newErrors.aiPrompt = "AI prompt is required";
      } else if (aiPrompt.trim().length < 10) {
        newErrors.aiPrompt =
          "AI prompt should be at least 10 characters to be meaningful";
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const formatOrdinal = (n: number) => {
    const s = ["th", "st", "nd", "rd"] as const;
    const v = n % 100;
    return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
  };

  // Live order preview for the entered priority
  const existingRules = rulesList?.data || [];
  const activeRules = existingRules.filter((r) => r.isActive);
  const totalRules = activeRules.length;
  const higherCount = activeRules.filter(
    (r) => (r.priority ?? 0) > (priority ?? 0)
  ).length;
  const previewPosition = higherCount + 1; // newest among equal priorities

  const handleSubmit = async () => {
    if (!validate()) return;

    let config: ExplicitRuleConfig | AiPromptRuleConfig;

    if (ruleType === "explicit") {
      config = {
        mode: "advanced",
        ...(subjectValues.some((v) => v.trim()) && {
          subject: {
            operator: subjectOperator,
            values: subjectValues.filter((v) => v.trim()),
          },
        }),
        ...(fromValues.some((v) => v.trim()) && {
          from: {
            operator: fromOperator,
            values: fromValues.filter((v) => v.trim()),
          },
        }),
        ...(toValues.some((v) => v.trim()) && {
          to: {
            operator: toOperator,
            values: toValues.filter((v) => v.trim()),
          },
        }),
        ...(hasAttachment !== undefined && { hasAttachment }),
        ...(wordsValues.some((v) => v.trim()) && {
          hasWords: {
            operator: wordsOperator,
            values: wordsValues.filter((v) => v.trim()),
          },
        }),
      } as ExplicitRuleConfig;
    } else {
      config = {
        mode: "advanced",
        prompt: aiPrompt,
      } as AiPromptRuleConfig;
    }

    // Build action config with discriminated union type
    let actionConfig: RuleActionConfig;
    if (action === "allow") {
      actionConfig = { action: "allow" };
    } else if (action === "block") {
      actionConfig = { action: "block" };
    } else if (action === "junk") {
      actionConfig = { action: "junk" };
    } else {
      actionConfig = { action: "route", endpointId: routeEndpointId };
    }

    try {
      const result = await createMutation.mutateAsync({
        name: name.trim(),
        description: description.trim() || undefined,
        type: ruleType,
        config,
        priority,
        action: actionConfig,
      });

      router.push(`/guard/rules/${result.id}`);
    } catch (error) {
      // Error toast is already shown by mutation onError handler
      console.error("Failed to create guard rule:", error);
    }
  };

  return (
    <div className="min-h-screen py-4 overflow-x-hidden">
      <div className="max-w-3xl mx-auto px-4">
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
        <div className="mb-4 flex items-center gap-2">
          <SidebarToggleButton />
          <h2 className="text-xl font-semibold tracking-tight">
            Create Guard Rule
          </h2>
        </div>

        {/* Form */}
        <div className="space-y-3">
          {/* Basic Info */}
          <section className="space-y-3">
            <h3 className="text-sm font-medium text-muted-foreground">
              Basic information
            </h3>
            {(errors.name || errors.priority) && (
              <div className="p-3 bg-red-50 border border-red-300 rounded-lg space-y-1">
                {errors.name && (
                  <p className="text-sm font-medium text-red-700">
                    {errors.name}
                  </p>
                )}
                {errors.priority && (
                  <p className="text-sm font-medium text-red-700">
                    {errors.priority}
                  </p>
                )}
              </div>
            )}
            <div>
              <Label htmlFor="name">Rule Name *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My filtering rule"
                className={errors.name ? "border-destructive" : ""}
              />
              {errors.name && (
                <p className="text-sm text-destructive mt-1">{errors.name}</p>
              )}
            </div>

            <div>
              <Label htmlFor="description">Description (optional)</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What does this rule do?"
                rows={3}
              />
            </div>

            <div>
              <Label htmlFor="priority">Priority</Label>
              <Input
                id="priority"
                type="number"
                value={priority}
                min={0}
                onChange={(e) =>
                  setPriority(Math.max(0, parseInt(e.target.value) || 0))
                }
                placeholder="0"
                className={errors.priority ? "border-destructive" : ""}
              />
              {errors.priority ? (
                <p className="text-sm text-destructive mt-1">
                  {errors.priority}
                </p>
              ) : (
                <div className="text-sm text-muted-foreground mt-1 space-y-1">
                  <p>Higher priority rules are evaluated first.</p>
                  <p>
                    With priority{" "}
                    <span className="font-medium">{priority}</span>, this rule
                    will be evaluated as the{" "}
                    <span className="font-medium">
                      {formatOrdinal(previewPosition)}
                    </span>{" "}
                    rule out of {totalRules + 1}.
                  </p>
                </div>
              )}
            </div>
          </section>

          {/* Rule Configuration (Type + Config Combined) */}
          <section className="space-y-3">
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-muted-foreground">
                Rule configuration
              </h3>
              <ToggleGroup
                type="single"
                value={ruleType}
                onValueChange={(v) => {
                  if (v === "explicit" || v === "ai_prompt") {
                    setRuleType(v);
                  }
                }}
                className="flex items-center gap-2 justify-start"
              >
                <ToggleGroupItem
                  value="explicit"
                  className="h-8 rounded-full px-4 border data-[state=on]:bg-primary data-[state=on]:text-white"
                >
                  Explicit
                </ToggleGroupItem>
                <ToggleGroupItem
                  value="ai_prompt"
                  className="h-8 rounded-full px-4 border data-[state=on]:bg-primary data-[state=on]:text-white"
                >
                  AI
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
            {ruleType === "explicit" ? (
              <div className="space-y-3">
                {errors.config && (
                  <div className="p-3 bg-red-50 border border-red-300 rounded-lg">
                    <p className="text-sm font-medium text-red-700">
                      {errors.config}
                    </p>
                  </div>
                )}
                <div className="space-y-4">
                  {/* Subject */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label>Subject Contains</Label>
                      <Select
                        value={subjectOperator}
                        onValueChange={(v) =>
                          setSubjectOperator(v as LogicOperator)
                        }
                      >
                        <SelectTrigger className="w-24">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="OR">OR</SelectItem>
                          <SelectItem value="AND">AND</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {subjectValues.map((value, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <Input
                          value={value}
                          onChange={(e) =>
                            handleValueChange(
                              index,
                              e.target.value,
                              subjectValues,
                              setSubjectValues
                            )
                          }
                          placeholder="Search term..."
                        />
                        {subjectValues.length > 1 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              handleRemoveValue(
                                index,
                                subjectValues,
                                setSubjectValues
                              )
                            }
                          >
                            <Trash2 width="16" height="16" />
                          </Button>
                        )}
                      </div>
                    ))}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        handleAddValue(subjectValues, setSubjectValues)
                      }
                    >
                      <CirclePlus width="16" height="16" className="mr-2" />
                      Add Value
                    </Button>
                  </div>

                  <Separator />

                  {/* From */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label>From (Email Address)</Label>
                      <Select
                        value={fromOperator}
                        onValueChange={(v) =>
                          setFromOperator(v as LogicOperator)
                        }
                      >
                        <SelectTrigger className="w-24">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="OR">OR</SelectItem>
                          <SelectItem value="AND">AND</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {fromValues.map((value, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <Input
                          value={value}
                          onChange={(e) =>
                            handleValueChange(
                              index,
                              e.target.value,
                              fromValues,
                              setFromValues
                            )
                          }
                          placeholder="email@domain.com or *@domain.com"
                        />
                        {fromValues.length > 1 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              handleRemoveValue(
                                index,
                                fromValues,
                                setFromValues
                              )
                            }
                          >
                            <Trash2 width="16" height="16" />
                          </Button>
                        )}
                      </div>
                    ))}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleAddValue(fromValues, setFromValues)}
                    >
                      <CirclePlus width="16" height="16" className="mr-2" />
                      Add Value
                    </Button>
                    <p className="text-sm text-muted-foreground">
                      Supports wildcards like *@domain.com
                    </p>
                  </div>

                  <Separator />

                  {/* To */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label>To (Email Address)</Label>
                      <Select
                        value={toOperator}
                        onValueChange={(v) =>
                          setToOperator(v as LogicOperator)
                        }
                      >
                        <SelectTrigger className="w-24">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="OR">OR</SelectItem>
                          <SelectItem value="AND">AND</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {toValues.map((value, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <Input
                          value={value}
                          onChange={(e) =>
                            handleValueChange(
                              index,
                              e.target.value,
                              toValues,
                              setToValues
                            )
                          }
                          placeholder="email@domain.com or *@domain.com"
                        />
                        {toValues.length > 1 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              handleRemoveValue(
                                index,
                                toValues,
                                setToValues
                              )
                            }
                          >
                            <Trash2 width="16" height="16" />
                          </Button>
                        )}
                      </div>
                    ))}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleAddValue(toValues, setToValues)}
                    >
                      <CirclePlus width="16" height="16" className="mr-2" />
                      Add Value
                    </Button>
                    <p className="text-sm text-muted-foreground">
                      Matches the recipient address. Supports wildcards like
                      *@domain.com
                    </p>
                  </div>

                  <Separator />

                  {/* Has Attachment */}
                  <div className="space-y-3">
                    <Label>Has Attachment</Label>
                    <ToggleGroup
                      type="single"
                      value={
                        hasAttachment === true
                          ? "yes"
                          : hasAttachment === false
                            ? "no"
                            : "any"
                      }
                      onValueChange={(v) => {
                        if (v === "yes") setHasAttachment(true);
                        else if (v === "no") setHasAttachment(false);
                        else setHasAttachment(undefined);
                      }}
                      className="flex items-center gap-2 justify-start"
                    >
                      <ToggleGroupItem
                        value="yes"
                        className="h-8 rounded-full px-4 border data-[state=on]:bg-primary data-[state=on]:text-white"
                      >
                        Has attachment
                      </ToggleGroupItem>
                      <ToggleGroupItem
                        value="no"
                        className="h-8 rounded-full px-4 border data-[state=on]:bg-primary data-[state=on]:text-white"
                      >
                        No attachment
                      </ToggleGroupItem>
                      <ToggleGroupItem
                        value="any"
                        className="h-8 rounded-full px-4 border data-[state=on]:bg-primary data-[state=on]:text-white"
                      >
                        Any
                      </ToggleGroupItem>
                    </ToggleGroup>
                  </div>

                  <Separator />

                  {/* Has Words */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label>Email Body Contains</Label>
                      <Select
                        value={wordsOperator}
                        onValueChange={(v) =>
                          setWordsOperator(v as LogicOperator)
                        }
                      >
                        <SelectTrigger className="w-24">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="OR">OR</SelectItem>
                          <SelectItem value="AND">AND</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {wordsValues.map((value, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <Input
                          value={value}
                          onChange={(e) =>
                            handleValueChange(
                              index,
                              e.target.value,
                              wordsValues,
                              setWordsValues
                            )
                          }
                          placeholder="Word or phrase..."
                        />
                        {wordsValues.length > 1 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              handleRemoveValue(
                                index,
                                wordsValues,
                                setWordsValues
                              )
                            }
                          >
                            <Trash2 width="16" height="16" />
                          </Button>
                        )}
                      </div>
                    ))}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        handleAddValue(wordsValues, setWordsValues)
                      }
                    >
                      <CirclePlus width="16" height="16" className="mr-2" />
                      Add Value
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {errors.aiPrompt && (
                  <div className="p-3 bg-red-50 border border-red-300 rounded-lg">
                    <p className="text-sm font-medium text-red-700">
                      {errors.aiPrompt}
                    </p>
                  </div>
                )}
                <div>
                  <Label htmlFor="ai-prompt" className="flex items-center gap-2 mb-2">
                    <span className="text-red-500">*</span>AI Evaluation <Badge variant="outline">beta</Badge>
                  </Label>
                  <div className="bg-muted rounded-xl space-y-2">
                    <p className="text-sm font-medium px-3 pt-2">Format the prompt to be an answer to this question:</p>
                    <p className="text-xs px-3 text-muted-foreground font-mono">If the email you have been provided with matches the <b>criteria below</b>, trigger the rule, if not, do not trigger the rule.</p>
                    <Textarea
                      id="ai-prompt"
                      value={aiPrompt}
                      onChange={(e) => setAiPrompt(e.target.value)}
                      placeholder="If the email is trying to sell me something, trigger the rule."
                      rows={8}
                      className={errors.aiPrompt ? "border-destructive" : ""}
                    />
                  </div>
                  {errors.aiPrompt && (
                    <p className="text-sm text-destructive mt-1">
                      {errors.aiPrompt}
                    </p>
                  )}
                </div>
              </div>
            )}
          </section>

          {/* Rule Action */}
          <section className="space-y-3">
            <h3 className="text-sm font-medium text-muted-foreground">
              Rule action
            </h3>
            {errors.action && (
              <div className="p-3 bg-red-50 border border-red-300 rounded-lg">
                <p className="text-sm font-medium text-red-700">
                  {errors.action}
                </p>
              </div>
            )}
            <ToggleGroup
              type="single"
              value={action}
              onValueChange={(v) => {
                if (
                  v === "allow" ||
                  v === "block" ||
                  v === "junk" ||
                  v === "route"
                ) {
                  setAction(v);
                }
              }}
              className="flex items-center gap-2 justify-start"
            >
              <ToggleGroupItem
                value="allow"
                className="h-8 rounded-full px-4 border data-[state=on]:bg-primary data-[state=on]:text-white"
              >
                ALLOW
              </ToggleGroupItem>
              <ToggleGroupItem
                value="block"
                className="h-8 rounded-full px-4 border data-[state=on]:bg-primary data-[state=on]:text-white"
              >
                BLOCK
              </ToggleGroupItem>
              <ToggleGroupItem
                value="junk"
                className="h-8 rounded-full px-4 border data-[state=on]:bg-primary data-[state=on]:text-white"
              >
                JUNK
              </ToggleGroupItem>
              <ToggleGroupItem
                value="route"
                className="h-8 rounded-full px-4 border data-[state=on]:bg-primary data-[state=on]:text-white"
              >
                ROUTE
              </ToggleGroupItem>
            </ToggleGroup>
            {action === "route" && (
              <div className="space-y-2">
                <Label htmlFor="endpoint">Select Endpoint *</Label>
                <EndpointSelector
                  value={routeEndpointId || null}
                  onChange={(value) => setRouteEndpointId(value || "")}
                  placeholder="Choose an endpoint..."
                  filterActive={true}
                  className={errors.action ? "border-destructive" : ""}
                />
                {errors.action && (
                  <p className="text-sm text-destructive mt-1">
                    {errors.action}
                  </p>
                )}
              </div>
            )}
          </section>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" onClick={() => router.push("/guard")}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={createMutation.isPending}>
              {createMutation.isPending ? "Creating..." : "Create Rule"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

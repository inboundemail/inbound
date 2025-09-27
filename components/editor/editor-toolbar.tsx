'use client';

import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { 
  $getSelection, 
  $isRangeSelection,
  $getNodeByKey,
  FORMAT_TEXT_COMMAND,
  FORMAT_ELEMENT_COMMAND,
  UNDO_COMMAND,
  REDO_COMMAND,
} from 'lexical';
import { 
  $isHeadingNode,
  $createHeadingNode,
  $createQuoteNode,
} from '@lexical/rich-text';
import { 
  INSERT_UNORDERED_LIST_COMMAND,
  INSERT_ORDERED_LIST_COMMAND,
  REMOVE_LIST_COMMAND,
  $isListNode,
} from '@lexical/list';
import { $setBlocksType } from '@lexical/selection';
import { $createCodeNode } from '@lexical/code';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// Import Nucleo icons
import Bold from '@/components/icons/text-bold';
import Italic from '@/components/icons/text-italic';
import Underline from '@/components/icons/text-underline';
import Strikethrough from '@/components/icons/text-strikethrough';
import Code from '@/components/icons/code-2';
import AlignLeft from '@/components/icons/text-align-left-2';
import AlignCenter from '@/components/icons/text-align-center-2';
import AlignRight from '@/components/icons/text-align-right-2';
import ListBulleted from '@/components/icons/unordered-list-2';
import ListNumbered from '@/components/icons/ordered-list-2';
import Quote from '@/components/icons/blockquote';
import Undo from '@/components/icons/undo';
import Redo from '@/components/icons/redo';

const LowPriority = 1;

const supportedBlockTypes = new Set([
  'paragraph',
  'quote',
  'code',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'ul',
  'ol',
]);

const blockTypeToBlockName = {
  code: 'Code Block',
  h1: 'Heading 1',
  h2: 'Heading 2',
  h3: 'Heading 3',
  h4: 'Heading 4',
  h5: 'Heading 5',
  h6: 'Heading 6',
  ol: 'Numbered List',
  paragraph: 'Normal',
  quote: 'Quote',
  ul: 'Bulleted List',
};

export function EditorToolbar() {
  const [editor] = useLexicalComposerContext();
  const [activeEditor, setActiveEditor] = useState(editor);
  const [blockType, setBlockType] = useState('paragraph');
  const [isRTL, setIsRTL] = useState(false);
  const [fontSize, setFontSize] = useState('15px');
  const [fontColor, setFontColor] = useState('#000');
  const [bgColor, setBgColor] = useState('#fff');
  const [fontFamily, setFontFamily] = useState('Arial');
  const [isLink, setIsLink] = useState(false);
  const [isBold, setIsBold] = useState(false);
  const [isItalic, setIsItalic] = useState(false);
  const [isUnderline, setIsUnderline] = useState(false);
  const [isStrikethrough, setIsStrikethrough] = useState(false);
  const [isSubscript, setIsSubscript] = useState(false);
  const [isSuperscript, setIsSuperscript] = useState(false);
  const [isCode, setIsCode] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [modal, setModal] = useState<null | { type: string }>(null);
  const [isSmallWidthViewport, setIsSmallWidthViewport] = useState(false);
  const [isEditable, setIsEditable] = useState(() => editor.isEditable());

  const updateToolbar = useCallback(() => {
    const selection = $getSelection();
    if ($isRangeSelection(selection)) {
      const anchorNode = selection.anchor.getNode();
      let element =
        anchorNode.getKey() === 'root'
          ? anchorNode
          : $getNodeByKey(selection.anchor.key) || anchorNode.getTopLevelElementOrThrow();

      const elementKey = element.getKey();
      const elementDOM = activeEditor.getElementByKey(elementKey);

      // Update text format
      setIsBold(selection.hasFormat('bold'));
      setIsItalic(selection.hasFormat('italic'));
      setIsUnderline(selection.hasFormat('underline'));
      setIsStrikethrough(selection.hasFormat('strikethrough'));
      setIsSubscript(selection.hasFormat('subscript'));
      setIsSuperscript(selection.hasFormat('superscript'));
      setIsCode(selection.hasFormat('code'));
      setIsRTL($isRangeSelection(selection) && selection.isBackward());

      // Update links
      const node = getSelectedNode(selection);
      const parent = node.getParent();
      setIsLink(false);

      const tableNode = $findMatchingParent(node, $isTableNode);

      if ($isListNode(element)) {
        const parentList = $getNearestNodeOfType<ListNode>(anchorNode, ListNode);
        const type = parentList
          ? parentList.getListType()
          : element.getListType();
        setBlockType(type);
      } else {
        const type = $isHeadingNode(element)
          ? element.getTag()
          : element.getType();
        if (type in blockTypeToBlockName) {
          setBlockType(type as keyof typeof blockTypeToBlockName);
        }
        if ($isCodeNode(element)) {
          const language =
            element.getLanguage() as keyof typeof CODE_LANGUAGE_MAP;
          setCodeLanguage(
            language ? CODE_LANGUAGE_MAP[language] || language : '',
          );
          return;
        }
      }
    }
  }, [activeEditor]);

  useEffect(() => {
    return editor.registerCommand(
      SELECTION_CHANGE_COMMAND,
      (_payload, newEditor) => {
        updateToolbar();
        setActiveEditor(newEditor);
        return false;
      },
      COMMAND_PRIORITY_CRITICAL,
    );
  }, [editor, updateToolbar]);

  useEffect(() => {
    return mergeRegister(
      activeEditor.registerEditableListener((editable) => {
        setIsEditable(editable);
      }),
      activeEditor.registerUpdateListener(({editorState}) => {
        editorState.read(() => {
          updateToolbar();
        });
      }),
      activeEditor.registerCommand<boolean>(
        CAN_UNDO_COMMAND,
        (payload) => {
          setCanUndo(payload);
          return false;
        },
        COMMAND_PRIORITY_CRITICAL,
      ),
      activeEditor.registerCommand<boolean>(
        CAN_REDO_COMMAND,
        (payload) => {
          setCanRedo(payload);
          return false;
        },
        COMMAND_PRIORITY_CRITICAL,
      ),
    );
  }, [activeEditor, updateToolbar]);

  const formatParagraph = () => {
    editor.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        $setBlocksType(selection, () => $createParagraphNode());
      }
    });
  };

  const formatHeading = (headingSize: HeadingTagType) => {
    if (blockType !== headingSize) {
      editor.update(() => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) {
          $setBlocksType(selection, () => $createHeadingNode(headingSize));
        }
      });
    }
  };

  const formatBulletList = () => {
    if (blockType !== 'ul') {
      editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined);
    } else {
      editor.dispatchCommand(REMOVE_LIST_COMMAND, undefined);
    }
  };

  const formatNumberedList = () => {
    if (blockType !== 'ol') {
      editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined);
    } else {
      editor.dispatchCommand(REMOVE_LIST_COMMAND, undefined);
    }
  };

  const formatQuote = () => {
    if (blockType !== 'quote') {
      editor.update(() => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) {
          $setBlocksType(selection, () => $createQuoteNode());
        }
      });
    }
  };

  const formatCode = () => {
    if (blockType !== 'code') {
      editor.update(() => {
        let selection = $getSelection();

        if ($isRangeSelection(selection)) {
          if (selection.isCollapsed()) {
            $setBlocksType(selection, () => $createCodeNode());
          } else {
            const textContent = selection.getTextContent();
            const codeNode = $createCodeNode();
            selection.insertNodes([codeNode]);
            selection = $getSelection();
            if ($isRangeSelection(selection)) {
              selection.insertRawText(textContent);
            }
          }
        }
      });
    }
  };

  return (
    <div className="flex items-center gap-1 p-2 bg-muted/50">
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          disabled={!canUndo || !isEditable}
          onClick={() => {
            activeEditor.dispatchCommand(UNDO_COMMAND, undefined);
          }}
          title="Undo (Ctrl+Z)"
          className="h-8 w-8 p-0"
        >
          <Undo width="16" height="16" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={!canRedo || !isEditable}
          onClick={() => {
            activeEditor.dispatchCommand(REDO_COMMAND, undefined);
          }}
          title="Redo (Ctrl+Y)"
          className="h-8 w-8 p-0"
        >
          <Redo width="16" height="16" />
        </Button>
      </div>

      <Separator orientation="vertical" className="h-6 mx-1" />

      <div className="flex items-center gap-1">
        <Select
          value={blockType}
          onValueChange={(value) => {
            if (value === 'paragraph') {
              formatParagraph();
            } else if (value === 'h1') {
              formatHeading('h1');
            } else if (value === 'h2') {
              formatHeading('h2');
            } else if (value === 'h3') {
              formatHeading('h3');
            } else if (value === 'ul') {
              formatBulletList();
            } else if (value === 'ol') {
              formatNumberedList();
            } else if (value === 'quote') {
              formatQuote();
            } else if (value === 'code') {
              formatCode();
            }
          }}
        >
          <SelectTrigger className="h-8 w-32 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="paragraph">Normal</SelectItem>
            <SelectItem value="h1">Heading 1</SelectItem>
            <SelectItem value="h2">Heading 2</SelectItem>
            <SelectItem value="h3">Heading 3</SelectItem>
            <SelectItem value="ul">Bullet List</SelectItem>
            <SelectItem value="ol">Numbered List</SelectItem>
            <SelectItem value="quote">Quote</SelectItem>
            <SelectItem value="code">Code Block</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Separator orientation="vertical" className="h-6 mx-1" />

      <div className="flex items-center gap-1">
        <Button
          variant={isBold ? "primary" : "ghost"}
          size="sm"
          disabled={!isEditable}
          onClick={() => {
            activeEditor.dispatchCommand(FORMAT_TEXT_COMMAND, 'bold');
          }}
          title="Bold (Ctrl+B)"
          className="h-8 w-8 p-0"
        >
          <Bold width="16" height="16" />
        </Button>
        <Button
          variant={isItalic ? "primary" : "ghost"}
          size="sm"
          disabled={!isEditable}
          onClick={() => {
            activeEditor.dispatchCommand(FORMAT_TEXT_COMMAND, 'italic');
          }}
          title="Italic (Ctrl+I)"
          className="h-8 w-8 p-0"
        >
          <Italic width="16" height="16" />
        </Button>
        <Button
          variant={isUnderline ? "primary" : "ghost"}
          size="sm"
          disabled={!isEditable}
          onClick={() => {
            activeEditor.dispatchCommand(FORMAT_TEXT_COMMAND, 'underline');
          }}
          title="Underline (Ctrl+U)"
          className="h-8 w-8 p-0"
        >
          <Underline width="16" height="16" />
        </Button>
        <Button
          variant={isStrikethrough ? "primary" : "ghost"}
          size="sm"
          disabled={!isEditable}
          onClick={() => {
            activeEditor.dispatchCommand(FORMAT_TEXT_COMMAND, 'strikethrough');
          }}
          title="Strikethrough"
          className="h-8 w-8 p-0"
        >
          <Strikethrough width="16" height="16" />
        </Button>
        <Button
          variant={isCode ? "primary" : "ghost"}
          size="sm"
          disabled={!isEditable}
          onClick={() => {
            activeEditor.dispatchCommand(FORMAT_TEXT_COMMAND, 'code');
          }}
          title="Inline Code"
          className="h-8 w-8 p-0"
        >
          <Code width="16" height="16" />
        </Button>
      </div>

      <Separator orientation="vertical" className="h-6 mx-1" />

      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          disabled={!isEditable}
          onClick={() => {
            activeEditor.dispatchCommand(FORMAT_ELEMENT_COMMAND, 'left');
          }}
          title="Align Left"
          className="h-8 w-8 p-0"
        >
          <AlignLeft width="16" height="16" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={!isEditable}
          onClick={() => {
            activeEditor.dispatchCommand(FORMAT_ELEMENT_COMMAND, 'center');
          }}
          title="Align Center"
          className="h-8 w-8 p-0"
        >
          <AlignCenter width="16" height="16" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={!isEditable}
          onClick={() => {
            activeEditor.dispatchCommand(FORMAT_ELEMENT_COMMAND, 'right');
          }}
          title="Align Right"
          className="h-8 w-8 p-0"
        >
          <AlignRight width="16" height="16" />
        </Button>
      </div>
    </div>
  );
}

// Helper functions
function getSelectedNode(selection: RangeSelection): TextNode | ElementNode {
  const anchor = selection.anchor;
  const focus = selection.focus;
  const anchorNode = selection.anchor.getNode();
  const focusNode = selection.focus.getNode();
  if (anchorNode === focusNode) {
    return anchorNode;
  }
  const isBackward = selection.isBackward();
  if (isBackward) {
    return focusNode;
  } else {
    return anchorNode;
  }
}

// Import missing functions and types
import {
  $createParagraphNode,
  COMMAND_PRIORITY_CRITICAL,
  SELECTION_CHANGE_COMMAND,
  CAN_UNDO_COMMAND,
  CAN_REDO_COMMAND,
  TextNode,
  ElementNode,
  RangeSelection,
} from 'lexical';
import { $findMatchingParent, $getNearestNodeOfType, mergeRegister } from '@lexical/utils';
import { $isCodeNode } from '@lexical/code';
import { $isTableNode, TableNode } from '@lexical/table';
import { HeadingTagType } from '@lexical/rich-text';
import { ListNode } from '@lexical/list';

const CODE_LANGUAGE_MAP = {
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  python: 'Python',
  java: 'Java',
  c: 'C',
  cpp: 'C++',
  csharp: 'C#',
  php: 'PHP',
  ruby: 'Ruby',
  go: 'Go',
  rust: 'Rust',
  swift: 'Swift',
  kotlin: 'Kotlin',
  scala: 'Scala',
  html: 'HTML',
  css: 'CSS',
  scss: 'SCSS',
  less: 'LESS',
  json: 'JSON',
  xml: 'XML',
  yaml: 'YAML',
  markdown: 'Markdown',
  bash: 'Bash',
  shell: 'Shell',
  sql: 'SQL',
  graphql: 'GraphQL',
  dockerfile: 'Dockerfile',
};

function setCodeLanguage(language: string) {
  // Implementation for setting code language
}

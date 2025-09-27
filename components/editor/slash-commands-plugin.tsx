'use client';

import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  $createParagraphNode,
  $getSelection,
  $isRangeSelection,
  $getNodeByKey,
  TextNode,
  COMMAND_PRIORITY_LOW,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_UP_COMMAND,
  KEY_ESCAPE_COMMAND,
  KEY_TAB_COMMAND,
  KEY_ENTER_COMMAND,
} from 'lexical';
import {
  $createHeadingNode,
  $createQuoteNode,
  HeadingTagType,
} from '@lexical/rich-text';
import {
  INSERT_UNORDERED_LIST_COMMAND,
  INSERT_ORDERED_LIST_COMMAND,
} from '@lexical/list';
import { $createCodeNode } from '@lexical/code';
import { INSERT_TABLE_COMMAND } from '@lexical/table';
import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';

// Import Nucleo icons
import Heading1 from '@/components/icons/heading-1';
import Heading2 from '@/components/icons/heading-2';
import Heading3 from '@/components/icons/heading-3';
import ListBulleted from '@/components/icons/unordered-list-2';
import ListNumbered from '@/components/icons/ordered-list-2';
import Quote from '@/components/icons/blockquote';
import Code from '@/components/icons/code-2';
import Table from '@/components/icons/table';
import Text from '@/components/icons/pilcrow';
import Divider from '@/components/icons/arrows-from-line-y';

interface SlashCommand {
  key: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ width: string; height: string }>;
  keywords: string[];
  onSelect: () => void;
}

interface SlashMenuProps {
  editor: any;
  anchorElementRef: HTMLElement;
  queryString: string;
  onClose: () => void;
  onSelectOption: (option: SlashCommand) => void;
}

function SlashMenu({ editor, anchorElementRef, queryString, onClose, onSelectOption }: SlashMenuProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [coords, setCoords] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  // Position the menu near the caret
  useLayoutEffect(() => {
    const update = () => {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      const rect = sel.getRangeAt(0).getBoundingClientRect();
      const menuWidth = 256; // Tailwind w-64
      const margin = 8;
      const top = rect.bottom + margin;
      const left = Math.min(Math.max(margin, rect.left), window.innerWidth - menuWidth - margin);
      setCoords({ top, left });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [anchorElementRef, queryString]);

  const commands: SlashCommand[] = [
    {
      key: 'paragraph',
      label: 'Text',
      description: 'Just start typing with plain text.',
      icon: Text,
      keywords: ['paragraph', 'text', 'plain'],
      onSelect: () => {
        editor.update(() => {
          const selection = $getSelection();
          if ($isRangeSelection(selection)) {
            const paragraphNode = $createParagraphNode();
            selection.insertNodes([paragraphNode]);
          }
        });
      },
    },
    {
      key: 'h1',
      label: 'Heading 1',
      description: 'Big section heading.',
      icon: Heading1,
      keywords: ['heading', 'header', 'h1', 'title'],
      onSelect: () => {
        editor.update(() => {
          const selection = $getSelection();
          if ($isRangeSelection(selection)) {
            const headingNode = $createHeadingNode('h1');
            selection.insertNodes([headingNode]);
          }
        });
      },
    },
    {
      key: 'h2',
      label: 'Heading 2',
      description: 'Medium section heading.',
      icon: Heading2,
      keywords: ['heading', 'header', 'h2', 'subtitle'],
      onSelect: () => {
        editor.update(() => {
          const selection = $getSelection();
          if ($isRangeSelection(selection)) {
            const headingNode = $createHeadingNode('h2');
            selection.insertNodes([headingNode]);
          }
        });
      },
    },
    {
      key: 'h3',
      label: 'Heading 3',
      description: 'Small section heading.',
      icon: Heading3,
      keywords: ['heading', 'header', 'h3'],
      onSelect: () => {
        editor.update(() => {
          const selection = $getSelection();
          if ($isRangeSelection(selection)) {
            const headingNode = $createHeadingNode('h3');
            selection.insertNodes([headingNode]);
          }
        });
      },
    },
    {
      key: 'ul',
      label: 'Bulleted list',
      description: 'Create a simple bulleted list.',
      icon: ListBulleted,
      keywords: ['list', 'bullet', 'unordered', 'ul'],
      onSelect: () => {
        editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined);
      },
    },
    {
      key: 'ol',
      label: 'Numbered list',
      description: 'Create a list with numbering.',
      icon: ListNumbered,
      keywords: ['list', 'number', 'ordered', 'ol'],
      onSelect: () => {
        editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined);
      },
    },
    {
      key: 'quote',
      label: 'Quote',
      description: 'Capture a quote.',
      icon: Quote,
      keywords: ['quote', 'blockquote', 'citation'],
      onSelect: () => {
        editor.update(() => {
          const selection = $getSelection();
          if ($isRangeSelection(selection)) {
            const quoteNode = $createQuoteNode();
            selection.insertNodes([quoteNode]);
          }
        });
      },
    },
    {
      key: 'code',
      label: 'Code',
      description: 'Capture a code snippet.',
      icon: Code,
      keywords: ['code', 'codeblock', 'snippet'],
      onSelect: () => {
        editor.update(() => {
          const selection = $getSelection();
          if ($isRangeSelection(selection)) {
            const codeNode = $createCodeNode();
            selection.insertNodes([codeNode]);
          }
        });
      },
    },
    {
      key: 'table',
      label: 'Table',
      description: 'Insert a table.',
      icon: Table,
      keywords: ['table', 'grid', 'spreadsheet'],
      onSelect: () => {
        editor.dispatchCommand(INSERT_TABLE_COMMAND, {
          columns: '3',
          rows: '3',
          includeHeaders: true,
        });
      },
    },
    {
      key: 'divider',
      label: 'Divider',
      description: 'Visually divide blocks.',
      icon: Divider,
      keywords: ['divider', 'separator', 'hr', 'horizontal rule'],
      onSelect: () => {
        editor.update(() => {
          const selection = $getSelection();
          if ($isRangeSelection(selection)) {
            // Create a horizontal rule (divider)
            const dividerNode = $createParagraphNode();
            dividerNode.append($createTextNode('---'));
            selection.insertNodes([dividerNode]);
          }
        });
      },
    },
  ];

  const filteredCommands = commands.filter((command) => {
    const searchString = queryString.toLowerCase();
    return (
      command.label.toLowerCase().includes(searchString) ||
      command.description.toLowerCase().includes(searchString) ||
      command.keywords.some((keyword) => keyword.toLowerCase().includes(searchString))
    );
  });

  const selectOptionAndCleanUp = useCallback(
    (selectedOption: SlashCommand) => {
      editor.update(() => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) {
          const textNode = selection.anchor.getNode();
          if (textNode instanceof TextNode) {
            const textContent = textNode.getTextContent();
            const slashIndex = textContent.lastIndexOf('/');
            if (slashIndex !== -1) {
              textNode.select(slashIndex, textContent.length);
              selection.removeText();
            }
          }
        }
        selectedOption.onSelect();
        onClose();
      });
    },
    [editor, onClose]
  );

  const updateSelectedIndex = useCallback(
    (index: number) => {
      const rootElem = editor.getRootElement();
      if (rootElem !== null) {
        rootElem.setAttribute('aria-activedescendant', `typeahead-item-${index}`);
        setSelectedIndex(index);
      }
    },
    [editor]
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        const newIndex = selectedIndex < filteredCommands.length - 1 ? selectedIndex + 1 : 0;
        updateSelectedIndex(newIndex);
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        const newIndex = selectedIndex > 0 ? selectedIndex - 1 : filteredCommands.length - 1;
        updateSelectedIndex(newIndex);
      } else if (event.key === 'Tab' || event.key === 'Enter') {
        event.preventDefault();
        if (filteredCommands[selectedIndex]) {
          selectOptionAndCleanUp(filteredCommands[selectedIndex]);
        }
      } else if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };

    const rootElement = editor.getRootElement();
    if (rootElement) {
      rootElement.addEventListener('keydown', handleKeyDown);
      return () => rootElement.removeEventListener('keydown', handleKeyDown);
    }
  }, [editor, filteredCommands, selectedIndex, selectOptionAndCleanUp, updateSelectedIndex, onClose]);

  useEffect(() => {
    if (filteredCommands.length === 0) {
      setSelectedIndex(0);
    } else if (selectedIndex >= filteredCommands.length) {
      setSelectedIndex(filteredCommands.length - 1);
    }
  }, [filteredCommands.length, selectedIndex]);

  if (!filteredCommands.length) {
    return null;
  }

  return createPortal(
    <div
      className="fixed z-50 w-64 bg-popover border border-border rounded-lg shadow-lg p-1 max-h-64 overflow-y-auto"
      style={{ top: coords.top, left: coords.left }}
    >
      {filteredCommands.map((command, index) => (
        <div
          key={command.key}
          id={`typeahead-item-${index}`}
          className={`flex items-center gap-3 px-3 py-2 rounded cursor-pointer transition-colors ${
            index === selectedIndex
              ? 'bg-accent text-accent-foreground'
              : 'hover:bg-accent/50'
          }`}
          onClick={() => selectOptionAndCleanUp(command)}
          onMouseEnter={() => updateSelectedIndex(index)}
        >
          <div className="flex-shrink-0 w-4 h-4 text-muted-foreground">
            <command.icon width="16" height="16" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium">{command.label}</div>
            <div className="text-xs text-muted-foreground truncate">
              {command.description}
            </div>
          </div>
        </div>
      ))}
    </div>,
    document.body!
  );
}

export function SlashCommandsPlugin(): React.ReactElement | null {
  const [editor] = useLexicalComposerContext();
  const [queryString, setQueryString] = useState<string | null>(null);
  const [anchorElementRef, setAnchorElementRef] = useState<HTMLElement | null>(null);

  const checkForSlashTriggerMatch = useCallback(() => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
      return null;
    }

    const textNode = selection.anchor.getNode();
    if (!textNode || !(textNode instanceof TextNode)) {
      return null;
    }

    const textContent = textNode.getTextContent();
    const slashIndex = textContent.lastIndexOf('/');
    
    if (slashIndex === -1) {
      return null;
    }

    const query = textContent.slice(slashIndex + 1);
    if (query.length > 20) {
      return null;
    }

    return {
      leadOffset: slashIndex,
      matchingString: query,
      replaceableString: `/${query}`,
    };
  }, []);

  const onSelectOption = useCallback(
    (selectedOption: SlashCommand) => {
      editor.update(() => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) {
          selectedOption.onSelect();
        }
      });
    },
    [editor]
  );

  useEffect(() => {
    const updateListener = () => {
      editor.getEditorState().read(() => {
        const match = checkForSlashTriggerMatch();
        if (match) {
          console.log('Slash trigger detected:', match);
          setQueryString(match.matchingString);
          
          const selection = $getSelection();
          if ($isRangeSelection(selection)) {
            const node = selection.anchor.getNode();
            const rootElement = editor.getRootElement();
            if (rootElement) {
              setAnchorElementRef(rootElement);
            }
          }
        } else {
          setQueryString(null);
          setAnchorElementRef(null);
        }
      });
    };

    const removeUpdateListener = editor.registerUpdateListener(updateListener);

    return () => {
      removeUpdateListener();
    };
  }, [editor, checkForSlashTriggerMatch]);

  if (queryString !== null && anchorElementRef) {
    console.log('Rendering SlashMenu with queryString:', queryString);
    return (
      <SlashMenu
        editor={editor}
        anchorElementRef={anchorElementRef!}
        queryString={queryString}
        onClose={() => {
          setQueryString(null);
          setAnchorElementRef(null);
        }}
        onSelectOption={onSelectOption}
      />
    );
  }
  
  return null;
}

// Import missing functions
import { $createTextNode } from 'lexical';

import { prisma } from "@/lib/prisma";

export interface ParsedCodeEntity {
  name: string;
  type: "CLASS" | "FUNCTION" | "VARIABLE" | "IMPORT" | "EXPORT" | "INTERFACE" | "TYPE";
  startLine: number;
  endLine: number;
  signature?: string;
}

export interface ParsedCodeDependency {
  sourceName: string;
  targetName: string;
  targetPath?: string;
  type: "IMPORTS" | "CALLS" | "EXTENDS" | "IMPLEMENTS" | "TYPE_OF";
}

export interface CodeParseResult {
  entities: ParsedCodeEntity[];
  dependencies: ParsedCodeDependency[];
}

export function parseCode(content: string, fileName: string): CodeParseResult {
  const lines = content.split("\n");
  const entities: ParsedCodeEntity[] = [];
  const dependencies: ParsedCodeDependency[] = [];

  const isJsTsFile = /\.(js|jsx|ts|tsx)$/i.test(fileName);
  const isPythonFile = /\.py$/i.test(fileName);

  if (isJsTsFile) {
    parseJsTsCode(content, lines, entities, dependencies);
  } else if (isPythonFile) {
    parsePythonCode(content, lines, entities, dependencies);
  }

  return { entities, dependencies };
}

function parseJsTsCode(
  content: string,
  lines: string[],
  entities: ParsedCodeEntity[],
  dependencies: ParsedCodeDependency[]
) {
  const importRegex = /(?:import|export)\s+(?:(?:\{[^}]*\})|(?:\*\s+as\s+\w+)|(?:\w+))\s+from\s+['"]([^'"]+)['"]/g;
  const exportDefaultRegex = /export\s+default\s+(?:async\s+)?(?:function|class|const)\s+(\w+)/;
  const functionRegex = /^(?:export\s+)?(?:async\s+)?(?:function|const|let)\s+(\w+)\s*(?:=|\()/gm;
  const classRegex = /^(?:export\s+)?class\s+(\w+)(?:\s+extends\s+(\w+))?(?:\s+implements\s+([^{]+))?/gm;
  const interfaceRegex = /^(?:export\s+)?interface\s+(\w+)(?:\s+extends\s+([^{]+))?/gm;
  const typeRegex = /^(?:export\s+)?type\s+(\w+)\s*=/gm;
  const arrowFunctionRegex = /^(?:export\s+)?(?:const|let)\s+(\w+)\s*=\s*(?:\([^)]*\)\s*=>|\w+\s*\()/gm;

  lines.forEach((line, index) => {
    const lineNumber = index + 1;

    const importMatch = importRegex.exec(line);
    if (importMatch) {
      const importPath = importMatch[1];
      
      const namedImports = line.match(/\{([^}]*)\}/);
      if (namedImports) {
        const imports = namedImports[1].split(',').map(s => s.trim().split(' as ')[0]);
        imports.forEach(imp => {
          if (imp && imp !== '{') {
            dependencies.push({
              sourceName: "file",
              targetName: imp,
              targetPath: importPath,
              type: "IMPORTS"
            });
            entities.push({
              name: imp,
              type: "IMPORT",
              startLine: lineNumber,
              endLine: lineNumber,
              signature: line.trim()
            });
          }
        });
      }
    }

    if (exportDefaultRegex.test(line)) {
      const match = line.match(exportDefaultRegex);
      if (match) {
        entities.push({
          name: match[1],
          type: "EXPORT",
          startLine: lineNumber,
          endLine: lineNumber,
          signature: line.trim()
        });
      }
    }

    if (classRegex.test(line)) {
      const match = line.match(classRegex);
      if (match) {
        entities.push({
          name: match[1],
          type: "CLASS",
          startLine: lineNumber,
          endLine: findEndLine(lines, index, "{", "}"),
          signature: line.trim()
        });

        if (match[2]) {
          dependencies.push({
            sourceName: match[1],
            targetName: match[2],
            type: "EXTENDS"
          });
        }

        if (match[3]) {
          const interfaces = match[3].split(',').map(s => s.trim());
          interfaces.forEach(iface => {
            dependencies.push({
              sourceName: match[1],
              targetName: iface,
              type: "IMPLEMENTS"
            });
          });
        }
      }
    }

    if (interfaceRegex.test(line)) {
      const match = line.match(interfaceRegex);
      if (match) {
        entities.push({
          name: match[1],
          type: "INTERFACE",
          startLine: lineNumber,
          endLine: findEndLine(lines, index, "{", "}"),
          signature: line.trim()
        });

        if (match[2]) {
          const extendsInterfaces = match[2].split(',').map(s => s.trim());
          extendsInterfaces.forEach(extended => {
            dependencies.push({
              sourceName: match[1],
              targetName: extended,
              type: "EXTENDS"
            });
          });
        }
      }
    }

    if (typeRegex.test(line)) {
      const match = line.match(typeRegex);
      if (match) {
        entities.push({
          name: match[1],
          type: "TYPE",
          startLine: lineNumber,
          endLine: lineNumber,
          signature: line.trim()
        });
      }
    }

    const arrowFunctionMatch = arrowFunctionRegex.exec(line);
    if (arrowFunctionMatch) {
      const name = arrowFunctionMatch[1];
      if (!/^export\s+/.test(line) || line.includes('export')) {
        entities.push({
          name,
          type: "FUNCTION",
          startLine: lineNumber,
          endLine: findEndLine(lines, index, ";", "") || lineNumber,
          signature: line.trim()
        });
      }
    }
  });

  content.replace(functionRegex, (_, name) => {
    const match = content.match(new RegExp(`function\\s+${name}\\s*\\([^)]*\\)`, 'm'));
    if (match && match.index !== undefined) {
      const startLine = content.substring(0, match.index).split('\n').length;
      const funcContent = content.substring(match.index);
      const braceMatch = funcContent.match(/\{([\s\S]*)/);
      const endLine = braceMatch 
        ? startLine + funcContent.substring(0, braceMatch.index).split('\n').length - 1 + 
          countNestedBraces(braceMatch[1]) - 1
        : startLine;

      entities.push({
        name,
        type: "FUNCTION",
        startLine,
        endLine,
        signature: match[0]
      });
    }
    return '';
  });
}

function parsePythonCode(
  content: string,
  lines: string[],
  entities: ParsedCodeEntity[],
  dependencies: ParsedCodeDependency[]
) {
  const importRegex = /^(?:from\s+(\S+)\s+)?import\s+([^#\n]+)/;
  const classRegex = /^class\s+(\w+)(?:\s*\(([^)]+)\))?/;
  const functionRegex = /^(?:async\s+)?def\s+(\w+)\s*\(/;

  lines.forEach((line, index) => {
    const lineNumber = index + 1;

    const importMatch = line.match(importRegex);
    if (importMatch) {
      const moduleName = importMatch[1];
      const imports = importMatch[2].split(',').map(s => s.trim().split(' as ')[0]);
      
      imports.forEach(imp => {
        if (imp && imp !== '') {
          dependencies.push({
            sourceName: "file",
            targetName: imp,
            targetPath: moduleName || undefined,
            type: "IMPORTS"
          });
          entities.push({
            name: imp,
            type: "IMPORT",
            startLine: lineNumber,
            endLine: lineNumber,
            signature: line.trim()
          });
        }
      });
    }

    const classMatch = line.match(classRegex);
    if (classMatch) {
      entities.push({
        name: classMatch[1],
        type: "CLASS",
        startLine: lineNumber,
        endLine: findEndLine(lines, index, ":", ""),
        signature: line.trim()
      });

      if (classMatch[2]) {
        const bases = classMatch[2].split(',').map(s => s.trim());
        bases.forEach(base => {
          dependencies.push({
            sourceName: classMatch[1],
            targetName: base,
            type: "EXTENDS"
          });
        });
      }
    }

    const functionMatch = line.match(functionRegex);
    if (functionMatch && !line.trim().startsWith('#')) {
      entities.push({
        name: functionMatch[1],
        type: "FUNCTION",
        startLine: lineNumber,
        endLine: findEndLine(lines, index, ":", ""),
        signature: line.trim()
      });
    }
  });
}

function findEndLine(lines: string[], startIndex: number, startChar: string, endChar: string): number {
  let depth = 0;
  let inString = false;
  let stringChar = '';

  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i];
    
    for (let j = 0; j < line.length; j++) {
      const char = line[j];

      if ((char === '"' || char === "'" || char === '`') && line[j - 1] !== '\\') {
        if (!inString) {
          inString = true;
          stringChar = char;
        } else if (char === stringChar) {
          inString = false;
        }
      }

      if (inString) continue;

      if (startChar === ':' && endChar === '') {
        if (char === ':' && i > startIndex) {
          return i + 1;
        }
        continue;
      }

      if (char === startChar) {
        depth++;
      } else if (char === endChar) {
        depth--;
        if (depth === 0) {
          return i + 1;
        }
      }
    }
  }

  return startIndex + 1;
}

function countNestedBraces(content: string): number {
  let depth = 0;
  for (const char of content) {
    if (char === '{') depth++;
    else if (char === '}') depth--;
    if (depth === 0) return 1;
  }
  return 1;
}

export async function saveParsedCode(
  fileId: string,
  parsedResult: CodeParseResult,
  projectId: string
) {
  const entityMap = new Map<string, string>();

  for (const entity of parsedResult.entities) {
    const createdEntity = await prisma.codeEntity.create({
      data: {
        fileId,
        name: entity.name,
        type: entity.type as any,
        startLine: entity.startLine,
        endLine: entity.endLine,
        signature: entity.signature,
      },
    });

    entityMap.set(entity.name, createdEntity.id);
  }

  for (const dep of parsedResult.dependencies) {
    const sourceId = entityMap.get(dep.sourceName);
    
    let targetId = entityMap.get(dep.targetName);
    
    if (!targetId && dep.targetPath) {
      const existingFile = await prisma.projectFile.findFirst({
        where: {
          projectId,
          name: {
            contains: dep.targetPath.replace(/\.\w+$/, ''),
            mode: 'insensitive'
          }
        }
      });

      if (existingFile) {
        const targetEntity = await prisma.codeEntity.findFirst({
          where: {
            fileId: existingFile.id,
            name: dep.targetName
          }
        });

        if (targetEntity) {
          targetId = targetEntity.id;
        }
      }
    }

    if (sourceId && targetId) {
      await prisma.codeDependency.create({
        data: {
          sourceId,
          targetId,
          type: dep.type as any,
        },
      });
    }
  }
}

export async function deleteCodeEntities(fileId: string) {
  await prisma.codeDependency.deleteMany({
    where: {
      OR: [
        { source: { fileId } },
        { target: { fileId } }
      ]
    }
  });

  await prisma.codeEntity.deleteMany({
    where: { fileId },
  });
}

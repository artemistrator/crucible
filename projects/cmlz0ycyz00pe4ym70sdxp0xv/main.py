import sys
import re

def tokenize(expression: str) -> list:
    """
    Разбивает строку выражения на токены (числа, операторы, скобки).
    Игнорирует пробелы.
    """
    # Регулярное выражение для чисел (целых и дробных), операторов и скобок
    pattern = r"\d+(\.\d+)?|[-+*/()]"
    tokens = re.findall(pattern, expression)
    return tokens

def shunting_yard(tokens: list) -> list:
    """
    Преобразует список токенов из инфиксной записи в Обратную польскую запись (ОПЗ/RPN).
    Использует алгоритм сортировочной станции (Shunting-yard algorithm).
    """
    output_queue = []
    operator_stack = []
    
    # Словарь приоритетов операций
    precedence = {
        '+': 1,
        '-': 1,
        '*': 2,
        '/': 2
    }
    
    for token in tokens:
        # Если токен — число, добавляем в выходную очередь
        if token.replace('.', '', 1).isdigit():
            output_queue.append(token)
        # Если токен — оператор
        elif token in precedence:
            while (operator_stack and 
                   operator_stack[-1] != '(' and 
                   precedence[operator_stack[-1]] >= precedence[token]):
                output_queue.append(operator_stack.pop())
            operator_stack.append(token)
        # Если токен — открывающая скобка
        elif token == '(':
            operator_stack.append(token)
        # Если токен — закрывающая скобка
        elif token == ')':
            while operator_stack and operator_stack[-1] != '(':
                output_queue.append(operator_stack.pop())
            if operator_stack and operator_stack[-1] == '(':
                operator_stack.pop() # Удаляем '(' из стека
            else:
                raise ValueError("Несогласованные скобки")
    
    # Выталкиваем оставшиеся операторы из стека в очередь
    while operator_stack:
        op = operator_stack.pop()
        if op == '(':
            raise ValueError("Несогласованные скобки")
        output_queue.append(op)
        
    return output_queue

def evaluate_rpn(rpn_tokens: list) -> float:
    """
    Вычисляет результат выражения, представленного в ОПЗ (RPN).
    Использует стек для чисел.
    """
    stack = []
    
    for token in rpn_tokens:
        if token.replace('.', '', 1).isdigit():
            # Если число целое, можно хранить как int, иначе float
            if '.' in token:
                stack.append(float(token))
            else:
                stack.append(int(token))
        else:
            # Если токен — оператор, извлекаем два операнда
            if len(stack) < 2:
                raise ValueError("Некорректное выражение: недостаточно операндов")
            
            right = stack.pop()
            left = stack.pop()
            
            if token == '+':
                result = left + right
            elif token == '-':
                result = left - right
            elif token == '*':
                result = left * right
            elif token == '/':
                if right == 0:
                    raise ValueError("Ошибка: деление на ноль")
                result = left / right
            else:
                raise ValueError(f"Неизвестный оператор: {token}")
            
            stack.append(result)
    
    if len(stack) != 1:
        raise ValueError("Некорректное выражение: лишние операнды")
        
    return stack[0]

def main():
    if len(sys.argv) < 2:
        print("Usage: python main.py \"<expression>\"")
        print("Example: python main.py \"2 + 2 * 2\"")
        sys.exit(1)

    expression = sys.argv[1]
    
    try:
        tokens = tokenize(expression)
        if not tokens:
            print("Ошибка: пустое выражение или не найдены токены")
            sys.exit(1)
            
        rpn_tokens = shunting_yard(tokens)
        result = evaluate_rpn(rpn_tokens)
        
        print(result)
    except ValueError as e:
        print(f"Ошибка: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"Непредвиденная ошибка: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
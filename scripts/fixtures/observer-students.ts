// Representative fixture, not the user's original student-management program.
const program = `"""Representative student records and grade calculations."""
def calculate_percentage(marks):
    if not marks:
        return 0
    total_marks = sum(marks.values())
    number_of_subjects = len(marks)
    return total_marks / number_of_subjects

def calculate_grade(percentage):
    if percentage >= 90:
        return "A+"
    if percentage >= 80:
        return "A"
    if percentage >= 70:
        return "B"
    if percentage >= 60:
        return "C"
    if percentage >= 50:
        return "D"
    return "F"

def find_students(students, keyword):
    keyword = keyword.lower()
    return {key: value for key, value in students.items()
            if keyword in key.lower() or keyword in value["name"].lower()}
`;
export const student253 = program + Array.from({length: 253 - program.split('\n').length}, (_, i) => `# Representative teaching note ${i + 1}: percentages average the subject marks.\n`).join('');
export const behavioralAssertions = `
assert calculate_percentage({}) == 0
assert calculate_percentage({'Math': 90, 'Programming': 70}) == 80
assert calculate_percentage({'Math': 0}) == 0
assert calculate_grade(90) == 'A+'
assert calculate_grade(89) == 'A'
assert calculate_grade(49) == 'F'
`;
export const studentFixtures = [
 {name:'random-text', content:student253.replace('    total_marks =', '    random text inserted here\n    total_marks ='), line:5, expected:'correction'},
 {name:'unfinished', content:student253.replace('return total_marks / number_of_subjects','return total_marks /'), line:7, expected:'correction'},
 {name:'concrete-bug', content:student253.replace('return total_marks / number_of_subjects','return total_marks * number_of_subjects'), line:7, expected:'correction'},
 {name:'already-correct', content:student253, line:7, expected:'no_suggestion'},
 {name:'30000-characters', content:student253.replace('return total_marks / number_of_subjects','return total_marks * number_of_subjects').padEnd(30_000, '\n'), line:7, expected:'correction'},
] as const;

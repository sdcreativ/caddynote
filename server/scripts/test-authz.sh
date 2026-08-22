#!/bin/bash
# Script de test manuel de la couche d'autorisation. Non destiné à être
# conservé comme suite de tests automatisés (à remplacer par de vrais tests
# d'intégration — cf. audit Lot 12 "Recette").
set -e
BASE="http://localhost:4000"
jget() { node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{console.log(JSON.parse(d)$1)}catch(e){console.error('PARSE_FAIL:',d);process.exit(1)}})"; }

register() {
  curl -s -X POST "$BASE/auth/register" -H "Content-Type: application/json" -d "$1"
}

echo "== Admin =="
ADMIN_RES=$(register '{"email":"authz.admin@test.local","password":"Password123","firstName":"Global","lastName":"Admin","role":"admin"}')
TOKEN_ADMIN=$(echo "$ADMIN_RES" | jget ".token")

echo "== Institutions A & B =="
INST_A=$(curl -s -X POST "$BASE/institutions" -H "Authorization: Bearer $TOKEN_ADMIN" -H "Content-Type: application/json" -d '{"name":"Ecole A","type":"school"}' | jget ".institution.id")
INST_B=$(curl -s -X POST "$BASE/institutions" -H "Authorization: Bearer $TOKEN_ADMIN" -H "Content-Type: application/json" -d '{"name":"Ecole B","type":"school"}' | jget ".institution.id")
echo "INST_A=$INST_A INST_B=$INST_B"

mkuser() {
  if [ "$4" = "null" ]; then
    register "{\"email\":\"$1\",\"password\":\"Password123\",\"firstName\":\"$2\",\"lastName\":\"Test\",\"role\":\"$3\"}"
  else
    register "{\"email\":\"$1\",\"password\":\"Password123\",\"firstName\":\"$2\",\"lastName\":\"Test\",\"role\":\"$3\",\"institutionId\":$4}"
  fi
}

SCHOOLADMIN_A=$(mkuser "authz.schooladmin.a@test.local" "SchoolAdminA" "school_admin" "\"$INST_A\"")
TOKEN_SCHOOLADMIN_A=$(echo "$SCHOOLADMIN_A" | jget ".token")

TEACHER_A=$(mkuser "authz.teacher.a@test.local" "TeacherA" "teacher" "\"$INST_A\"")
TOKEN_TEACHER_A=$(echo "$TEACHER_A" | jget ".token")

TEACHER_B=$(mkuser "authz.teacher.b@test.local" "TeacherB" "teacher" "\"$INST_B\"")
TOKEN_TEACHER_B=$(echo "$TEACHER_B" | jget ".token")

STUDENT_A1=$(mkuser "authz.student.a1@test.local" "StudentA1" "student" "\"$INST_A\"")
TOKEN_STUDENT_A1=$(echo "$STUDENT_A1" | jget ".token")
ID_STUDENT_A1=$(echo "$STUDENT_A1" | jget ".user.id")

STUDENT_B1=$(mkuser "authz.student.b1@test.local" "StudentB1" "student" "\"$INST_B\"")
ID_STUDENT_B1=$(echo "$STUDENT_B1" | jget ".user.id")

PARENT_A1=$(mkuser "authz.parent.a1@test.local" "ParentA1" "parent" "null")
TOKEN_PARENT_A1=$(echo "$PARENT_A1" | jget ".token")
ID_PARENT_A1=$(echo "$PARENT_A1" | jget ".user.id")

echo "ID_STUDENT_A1=$ID_STUDENT_A1 ID_STUDENT_B1=$ID_STUDENT_B1 ID_PARENT_A1=$ID_PARENT_A1"

echo "$ID_STUDENT_A1 $INST_A $ID_STUDENT_B1 $INST_B $ID_PARENT_A1 $TOKEN_ADMIN $TOKEN_SCHOOLADMIN_A $TOKEN_TEACHER_A $TOKEN_TEACHER_B $TOKEN_STUDENT_A1 $TOKEN_PARENT_A1" > /tmp/authz_ids.txt

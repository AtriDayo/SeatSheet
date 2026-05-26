import { computed, ref } from "vue";

const adminPassword = ref("");

export function useAdminSession() {
  const authenticated = computed(() => adminPassword.value.length > 0);

  function setAdminPassword(password: string) {
    adminPassword.value = password;
  }

  function clearAdminSession() {
    adminPassword.value = "";
  }

  return {
    adminPassword,
    authenticated,
    setAdminPassword,
    clearAdminSession
  };
}

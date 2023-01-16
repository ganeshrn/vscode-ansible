// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace AnsibleCommands {
  export const ANSIBLE_VAULT = "extension.ansible.vault";
  export const ANSIBLE_INVENTORY_RESYNC = "extension.resync-ansible-inventory";
  export const ANSIBLE_PLAYBOOK_RUN = "extension.ansible-playbook.run";
  export const ANSIBLE_NAVIGATOR_RUN = "extension.ansible-navigator.run";
}

export namespace WisdomCommands {
  export const WISDOM_SUGGESTION_COMMIT = "editor.action.inlineSuggest.commit";
  export const WISDOM_SUGGESTION_HIDE = "editor.action.inlineSuggest.hide";
  export const WISDOM_SUGGESTION_TRIGGER =
    "editor.action.ansibleInlineSuggest.trigger";
}

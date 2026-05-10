;; local-toolkit emacs baseline

(setq inhibit-startup-message t)
(setq make-backup-files nil)
(setq auto-save-default nil)
(setq ring-bell-function 'ignore)
(setq-default indent-tabs-mode nil)
(setq-default tab-width 4)

;; graphical frame defaults
(setq initial-frame-alist '((width . 240) (height . 60)))

(menu-bar-mode -1)
(tool-bar-mode -1)
(scroll-bar-mode -1)
(global-display-line-numbers-mode 1)

(setq package-enable-at-startup nil)
(require 'package)
(add-to-list 'package-archives '("melpa" . "https://melpa.org/packages/") t)
(package-initialize)

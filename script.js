'use strict';

/* ================================================================
   BRAIN & SPINE HOSPITALS — SITE INTERACTIONS
   Table of Contents:
     1.  Configuration & Constants
     2.  Generic Utility Helpers
     3.  Sticky Navbar
     4.  Mobile Navigation Menu
     5.  Smooth Scrolling
     6.  Active Navigation Highlight
     7.  Hero Button Effects
     8.  Animated Statistics Counter
     9.  Scroll Reveal Animation (+ Statistics card animation)
     10. Department Card Interactions
     11. Doctor Card Interactions
     12. Testimonial Slider
     13. FAQ Accordion
     14. Appointment Form Validation
     15. Back-to-Top Button
     16. Floating Emergency Button
     17. Loading Screen
     18. Theme Toggle (Light / Dark)
     19. Health Tips Cards
     20. Contact Card Interactions
     21. Footer Effects
     22. Website Orchestrator & Bootstrap

   Notes on constraints:
   - This file does not modify index.html or style.css. Any markup this
     script needs (loading screen, theme toggle, back-to-top button,
     floating emergency button, testimonial controls, form error text)
     is created at runtime with document.createElement and either reuses
     existing classes already defined in style.css (.btn, .btn--outline,
     .btn--emergency, .form-hint, .sr-only, .animate-in) or applies
     inline styles directly — the stylesheet itself is untouched.
================================================================ */

/* ================================================================
   1. CONFIGURATION & CONSTANTS
================================================================ */
const CONFIG = Object.freeze({
	SCROLL_THRESHOLD: 40,             // px scrolled before the navbar switches to its "scrolled" state
	BACK_TO_TOP_THRESHOLD: 400,       // px scrolled before the back-to-top button appears
	HEADER_HEIGHT_DEFAULT: 84,        // must match --header-height in style.css
	HEADER_HEIGHT_SCROLLED: 64,       // shrunk height once the user scrolls
	HEADER_SHRINK_DURATION: 250,      // ms, how long the navbar shrink tween takes
	MOBILE_BREAKPOINT: 1024,          // must match the nav breakpoint in style.css
	SCROLL_OFFSET_BUFFER: 16,         // extra px of breathing room above a scrolled-to section
	COUNTER_DURATION: 1800,           // ms, how long the statistics count-up animation takes
	TESTIMONIAL_INTERVAL: 5000,       // ms between automatic testimonial changes
	TESTIMONIAL_FADE: 350,            // ms, crossfade duration between testimonials
	FAQ_TRANSITION: 350,              // ms, FAQ answer expand/collapse duration
	THEME_STORAGE_KEY: 'bsh-theme-preference',
	LOADING_SCREEN_SAFETY_TIMEOUT: 4000, // ms — hide the loader even if "load" never fires
});

/* ================================================================
   2. GENERIC UTILITY HELPERS
   Small, reusable functions shared across multiple features so the
   rest of the file stays DRY.
================================================================ */

/** Shorthand querySelector, optionally scoped to an element instead of the whole document. */
const qs = (selector, scope = document) => scope.querySelector(selector);

/** Shorthand querySelectorAll that returns a real (mappable/filterable) array. */
const qsa = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));

/** Clamp a number between a minimum and maximum. */
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

/** True when the user's OS/browser is set to minimize motion — animations should be skipped or shortened. */
const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Standard ease-out curve used for the count-up and navbar-shrink tweens. */
const easeOutCubic = (t) => 1 - (1 - t) ** 3;

/**
 * Delays invoking `fn` until `wait` ms have passed since the last call.
 * Used to keep resize/scroll-triggered work cheap.
 */
function debounce(fn, wait) {
	let timeoutId;
	return (...args) => {
		clearTimeout(timeoutId);
		timeoutId = setTimeout(() => fn(...args), wait);
	};
}

/**
 * A single requestAnimationFrame-driven tween, reused by the statistics
 * counter and the navbar height shrink. Skips straight to the end value
 * when the user prefers reduced motion.
 */
function animateValue({ from, to, duration, onUpdate, onComplete, easing = easeOutCubic }) {
	if (prefersReducedMotion() || duration <= 0) {
		onUpdate(to);
		onComplete?.();
		return;
	}

	const startTime = performance.now();

	const tick = (now) => {
		const progress = clamp((now - startTime) / duration, 0, 1);
		const currentValue = from + (to - from) * easing(progress);
		onUpdate(currentValue);

		if (progress < 1) {
			requestAnimationFrame(tick);
		} else {
			onComplete?.();
		}
	};

	requestAnimationFrame(tick);
}

/** Reads the navbar's current (possibly shrunk) height from its CSS custom property. */
function getCurrentHeaderHeight() {
	const value = getComputedStyle(document.documentElement).getPropertyValue('--header-height');
	return parseFloat(value) || CONFIG.HEADER_HEIGHT_DEFAULT;
}

/** Smoothly scrolls to an in-page section, accounting for the fixed header's height. */
function scrollToTarget(hash) {
	if (!hash || hash === '#') return;
	const target = qs(hash);
	if (!target) return;

	const headerOffset = getCurrentHeaderHeight() + CONFIG.SCROLL_OFFSET_BUFFER;
	const targetPosition = target.getBoundingClientRect().top + window.scrollY - headerOffset;

	window.scrollTo({
		top: targetPosition,
		behavior: prefersReducedMotion() ? 'auto' : 'smooth',
	});
}

/**
 * A single visually-hidden live region (reusing the existing .sr-only class)
 * used for one-off screen-reader announcements, e.g. the "article coming
 * soon" message from the health tips cards.
 */
let liveRegionEl = null;

function createLiveRegion() {
	const region = document.createElement('div');
	region.className = 'sr-only';
	region.setAttribute('role', 'status');
	region.setAttribute('aria-live', 'polite');
	document.body.appendChild(region);
	return region;
}

function announce(message) {
	liveRegionEl ??= createLiveRegion();
	liveRegionEl.textContent = message;
}

/* ================================================================
   3. STICKY NAVBAR
   Adds a background/shadow once the user scrolls past the threshold
   (handled by the existing .is-scrolled rule in style.css) and tweens
   the --header-height custom property so the bar visibly shrinks —
   every layout rule that depends on that variable shrinks with it.
================================================================ */
function initializeStickyNavbar() {
	const header = qs('.site-header');
	if (!header) return;

	let isScrolled = false;

	const tweenHeaderHeight = (targetHeight) => {
		const startHeight = getCurrentHeaderHeight();
		animateValue({
			from: startHeight,
			to: targetHeight,
			duration: CONFIG.HEADER_SHRINK_DURATION,
			onUpdate: (value) => {
				document.documentElement.style.setProperty('--header-height', `${value}px`);
			},
		});
	};

	const handleScroll = () => {
		const shouldBeScrolled = window.scrollY > CONFIG.SCROLL_THRESHOLD;
		if (shouldBeScrolled === isScrolled) return; // only react on state changes, not every scroll tick

		isScrolled = shouldBeScrolled;
		header.classList.toggle('is-scrolled', isScrolled); // CSS transitions background + shadow
		tweenHeaderHeight(isScrolled ? CONFIG.HEADER_HEIGHT_SCROLLED : CONFIG.HEADER_HEIGHT_DEFAULT);
	};

	document.addEventListener('scroll', handleScroll, { passive: true });
	handleScroll(); // correct the initial state if the page loads already scrolled (e.g. after a refresh)
}

/* ================================================================
   4. MOBILE NAVIGATION MENU
   Hamburger menu with open/close, outside-click dismissal, menu-item
   dismissal, Escape-to-close, and focus management.
================================================================ */
function initializeMobileMenu() {
	const toggleButton = qs('.site-nav__toggle');
	const menu = qs('.site-nav__menu');
	if (!toggleButton || !menu) return;

	const menuLinks = qsa('a', menu);

	const handleOutsideClick = (event) => {
		if (!menu.contains(event.target) && !toggleButton.contains(event.target)) {
			closeMenu();
		}
	};

	const handleEscapeKey = (event) => {
		if (event.key === 'Escape') closeMenu({ returnFocus: true });
	};

	function openMenu() {
		menu.classList.add('is-open');
		toggleButton.setAttribute('aria-expanded', 'true');
		menuLinks[0]?.focus(); // move focus into the menu for keyboard users
		document.addEventListener('click', handleOutsideClick);
		document.addEventListener('keydown', handleEscapeKey);
	}

	function closeMenu({ returnFocus = false } = {}) {
		menu.classList.remove('is-open');
		toggleButton.setAttribute('aria-expanded', 'false');
		document.removeEventListener('click', handleOutsideClick);
		document.removeEventListener('keydown', handleEscapeKey);
		if (returnFocus) toggleButton.focus();
	}

	toggleButton.addEventListener('click', () => {
		const isOpen = toggleButton.getAttribute('aria-expanded') === 'true';
		isOpen ? closeMenu() : openMenu();
	});

	// Selecting any menu item closes the menu (mobile users expect this).
	menuLinks.forEach((link) => link.addEventListener('click', () => closeMenu()));

	// If the viewport grows back past the mobile breakpoint while the menu
	// is open (e.g. rotating a tablet), don't leave it stuck open.
	window.addEventListener(
		'resize',
		debounce(() => {
			const isOpen = toggleButton.getAttribute('aria-expanded') === 'true';
			if (isOpen && window.innerWidth > CONFIG.MOBILE_BREAKPOINT) closeMenu();
		}, 200)
	);
}

/* ================================================================
   5. SMOOTH SCROLLING
   Nav and footer links that point to an in-page section scroll there
   smoothly instead of jumping, offset for the fixed header.
================================================================ */
function initializeSmoothScroll() {
	const scrollableLinks = qsa('.site-nav__menu a[href^="#"], .site-footer__links a[href^="#"]');

	scrollableLinks.forEach((link) => {
		link.addEventListener('click', (event) => {
			const hash = link.getAttribute('href');
			if (!hash || hash === '#' || !qs(hash)) return; // let placeholder/invalid hashes behave normally
			event.preventDefault();
			scrollToTarget(hash);
		});
	});
}

/* ================================================================
   6. ACTIVE NAVIGATION HIGHLIGHT
   Uses IntersectionObserver to highlight whichever nav item matches
   the section currently in view.
================================================================ */
function initializeActiveNavigation() {
	const navLinks = qsa('.site-nav__menu a[href^="#"]');
	if (navLinks.length === 0) return;

	const sections = navLinks
		.map((link) => qs(link.getAttribute('href')))
		.filter(Boolean);

	const setActiveLink = (hash) => {
		navLinks.forEach((link) => {
			const isActive = link.getAttribute('href') === hash;
			// No .is-active rule exists in style.css, so the "current section"
			// state is expressed with a direct inline style plus aria-current
			// for assistive technology.
			link.style.color = isActive ? 'var(--color-primary)' : '';
			link.style.fontWeight = isActive ? '700' : '';
			isActive ? link.setAttribute('aria-current', 'true') : link.removeAttribute('aria-current');
		});
	};

	const observer = new IntersectionObserver(
		(entries) => {
			// Multiple sections can be "intersecting" at once near a boundary;
			// pick whichever has the most of itself currently visible.
			const mostVisible = entries
				.filter((entry) => entry.isIntersecting)
				.sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

			if (mostVisible) setActiveLink(`#${mostVisible.target.id}`);
		},
		{ rootMargin: '-40% 0px -50% 0px', threshold: [0, 0.25, 0.5, 0.75, 1] }
	);

	sections.forEach((section) => observer.observe(section));
}

/* ================================================================
   7. HERO BUTTON EFFECTS
   "Book Appointment" scrolls to #appointment, "Our Specialists"
   scrolls to #doctors — both already point there via href, this just
   makes the scroll smooth and header-aware.
================================================================ */
function initializeHeroButtons() {
	const ctaGroup = qs('.hero__cta-group');
	if (!ctaGroup) return;

	qsa('a[href^="#"]', ctaGroup).forEach((button) => {
		button.addEventListener('click', (event) => {
			event.preventDefault();
			scrollToTarget(button.getAttribute('href'));
		});
	});
}

/* ================================================================
   8. ANIMATED STATISTICS COUNTER
   Counts each statistic up from 0 to its final value the first time
   it scrolls into view, preserving any "+" suffix or comma formatting.
================================================================ */

/** Splits "120,000+" into { prefix: "", value: 120000, suffix: "+" }. */
function parseStatValue(text) {
	const match = text.trim().match(/^(\D*)([\d,]+)(\D*)$/);
	if (!match) return null;

	const [, prefix, numberPart, suffix] = match;
	return { prefix, suffix, value: parseInt(numberPart.replace(/,/g, ''), 10) };
}

function animateCounter(element) {
	const parsed = parseStatValue(element.textContent);
	if (!parsed) return; // non-numeric labels are left untouched

	const { prefix, suffix, value } = parsed;

	animateValue({
		from: 0,
		to: value,
		duration: CONFIG.COUNTER_DURATION,
		onUpdate: (current) => {
			element.textContent = `${prefix}${Math.round(current).toLocaleString('en-US')}${suffix}`;
		},
	});
}

function initializeStatisticsCounter() {
	const counters = qsa('.stat-card__value, .statistics__value');
	if (counters.length === 0) return;

	const observer = new IntersectionObserver(
		(entries, obs) => {
			entries.forEach((entry) => {
				if (!entry.isIntersecting) return;
				animateCounter(entry.target);
				obs.unobserve(entry.target); // animate once only, per the spec
			});
		},
		{ threshold: 0.4 }
	);

	counters.forEach((counter) => observer.observe(counter));
}

/* ================================================================
   9. SCROLL REVEAL ANIMATION
   Fades each major section into view the first time it's scrolled
   into the viewport, reusing the .animate-in / fadeInUp keyframe
   already defined in style.css. Also separately animates the
   statistics cards with a staggered scale+fade (zoomIn keyframe).
================================================================ */
function initializeScrollReveal() {
	const revealSelectors = [
		'#home', '#about', '#departments', '#doctors', '#facilities',
		'#testimonials', '#appointment', '#faq', '#contact', '.site-footer',
	];
	const revealTargets = revealSelectors.map((selector) => qs(selector)).filter(Boolean);

	const sectionObserver = new IntersectionObserver(
		(entries, obs) => {
			entries.forEach((entry) => {
				if (!entry.isIntersecting) return;
				entry.target.classList.add('animate-in');
				obs.unobserve(entry.target);
			});
		},
		{ threshold: 0.12 }
	);
	revealTargets.forEach((target) => sectionObserver.observe(target));

	// Requirement: "Hospital Statistics Animation" — scale + fade the
	// individual stat cards in with a stagger, using the existing zoomIn
	// keyframe rather than the section-level fadeInUp.
	const statCards = qsa('.statistics__item');
	const statsObserver = new IntersectionObserver(
		(entries, obs) => {
			entries.forEach((entry) => {
				if (!entry.isIntersecting) return;
				obs.unobserve(entry.target);
				if (prefersReducedMotion()) return;

				const index = statCards.indexOf(entry.target);
				entry.target.style.animation = 'zoomIn 0.6s ease both';
				entry.target.style.animationDelay = `${index * 90}ms`;
			});
		},
		{ threshold: 0.3 }
	);
	statCards.forEach((card) => statsObserver.observe(card));
}

/* ================================================================
   10. DEPARTMENT CARD INTERACTIONS
   style.css already lifts + shadows these cards on :hover; this adds
   an accent border highlight (mouse + keyboard) and keyboard-focus
   parity with the mouse-hover lift, since :hover alone misses
   keyboard users tabbing to the "Learn More" link inside the card.
================================================================ */
function initializeDepartmentCards() {
	const cards = qsa('.department-card');

	cards.forEach((card) => {
		const highlightOn = () => {
			card.style.borderTopColor = 'var(--color-accent)';
			card.style.transform = 'translateY(-8px)';
			card.style.boxShadow = 'var(--shadow-lg)';
		};
		const highlightOff = () => {
			card.style.borderTopColor = '';
			card.style.transform = '';
			card.style.boxShadow = '';
		};

		card.addEventListener('mouseenter', highlightOn);
		card.addEventListener('mouseleave', highlightOff);
		// focusin/focusout bubble, so listening on the card catches focus
		// landing on the "Learn More" link inside it.
		card.addEventListener('focusin', highlightOn);
		card.addEventListener('focusout', highlightOff);
	});
}

/* ================================================================
   11. DOCTOR CARD INTERACTIONS
   Lift (keyboard parity, mouse already covered by CSS), photo zoom,
   and a small button "pop" — none of which style.css defines for
   doctor cards specifically.
================================================================ */
function initializeDoctorCards() {
	const cards = qsa('.doctor-card');

	cards.forEach((card) => {
		const image = qs('.doctor-card__media img', card);
		const button = qs('.btn', card);
		if (image) image.style.transition = 'transform .35s ease';

		const activate = () => {
			card.style.transform = 'translateY(-8px)';
			card.style.boxShadow = 'var(--shadow-lg)';
			if (image) image.style.transform = 'scale(1.08)';
		};
		const deactivate = () => {
			card.style.transform = '';
			card.style.boxShadow = '';
			if (image) image.style.transform = '';
		};

		card.addEventListener('mouseenter', activate);
		card.addEventListener('mouseleave', deactivate);
		card.addEventListener('focusin', activate);
		card.addEventListener('focusout', deactivate);

		// A little extra "pop" on the Book Appointment button itself, on
		// top of the lift/shadow/zoom it triggers on its parent card.
		button?.addEventListener('mouseenter', () => { button.style.transform = 'translateY(-3px) scale(1.03)'; });
		button?.addEventListener('mouseleave', () => { button.style.transform = ''; });
	});
}

/* ================================================================
   12. TESTIMONIAL SLIDER
   Converts the static 3-card grid into a one-at-a-time, auto-rotating
   slider with Prev/Next buttons and dot indicators, all created here
   since none of that markup exists in index.html.
================================================================ */
function initializeTestimonials() {
	const section = qs('.testimonials');
	const grid = qs('.testimonial-grid');
	if (!section || !grid) return;

	const cards = qsa('.testimonial-card', grid);
	if (cards.length === 0) return;

	let currentIndex = 0;
	let autoplayId = null;
	let pendingTransitionId = null;

	// --- Prepare the cards themselves for single-view slider behaviour ---
	grid.style.display = 'block'; // was CSS Grid (all 3 visible); slider shows one at a time
	cards.forEach((card, index) => {
		card.style.transition = `opacity ${CONFIG.TESTIMONIAL_FADE}ms ease`;
		card.style.display = index === 0 ? '' : 'none';
		card.style.opacity = index === 0 ? '1' : '0';
		card.setAttribute('aria-hidden', String(index !== 0));
	});

	// --- Build Prev / Next / dot controls ---
	const controls = document.createElement('div');
	controls.style.cssText = 'display:flex; align-items:center; justify-content:center; gap:1rem; margin-top:1.5rem; flex-wrap:wrap;';

	const prevButton = document.createElement('button');
	prevButton.type = 'button';
	prevButton.className = 'btn btn--outline';
	prevButton.textContent = '‹ Prev';
	prevButton.setAttribute('aria-label', 'Show previous testimonial');

	const nextButton = document.createElement('button');
	nextButton.type = 'button';
	nextButton.className = 'btn btn--outline';
	nextButton.textContent = 'Next ›';
	nextButton.setAttribute('aria-label', 'Show next testimonial');

	const dotsWrap = document.createElement('div');
	dotsWrap.style.cssText = 'display:flex; align-items:center; gap:.5rem;';

	const setDotAppearance = (dot, isActive) => {
		dot.style.background = isActive ? 'var(--color-primary)' : 'rgba(10, 110, 189, 0.25)';
		dot.setAttribute('aria-current', String(isActive));
	};

	const dots = cards.map((_, index) => {
		const dot = document.createElement('button');
		dot.type = 'button';
		dot.setAttribute('aria-label', `Show testimonial ${index + 1}`);
		dot.style.cssText = 'width:10px; height:10px; border-radius:50%; border:none; padding:0; cursor:pointer;';
		setDotAppearance(dot, index === 0);
		dot.addEventListener('click', () => goToSlide(index, true));
		dotsWrap.appendChild(dot);
		return dot;
	});

	controls.append(prevButton, dotsWrap, nextButton);
	grid.insertAdjacentElement('afterend', controls);

	// --- Slide transition logic ---
	function showSlide(newIndex) {
		if (newIndex === currentIndex) return;
		if (pendingTransitionId) clearTimeout(pendingTransitionId);

		const outgoing = cards[currentIndex];
		const incoming = cards[newIndex];

		outgoing.style.opacity = '0';
		outgoing.setAttribute('aria-hidden', 'true');

		pendingTransitionId = window.setTimeout(() => {
			outgoing.style.display = 'none';
			incoming.style.display = '';
			incoming.setAttribute('aria-hidden', 'false');
			void incoming.offsetWidth; // force reflow so the opacity transition below actually plays
			incoming.style.opacity = '1';
			pendingTransitionId = null;
		}, CONFIG.TESTIMONIAL_FADE);

		currentIndex = newIndex;
		dots.forEach((dot, index) => setDotAppearance(dot, index === currentIndex));
	}

	function goToSlide(index, userInitiated) {
		showSlide(index);
		if (userInitiated) restartAutoplay();
	}

	function startAutoplay() {
		if (prefersReducedMotion()) return;
		autoplayId = window.setInterval(() => {
			goToSlide((currentIndex + 1) % cards.length, false);
		}, CONFIG.TESTIMONIAL_INTERVAL);
	}

	function stopAutoplay() {
		if (!autoplayId) return;
		clearInterval(autoplayId);
		autoplayId = null;
	}

	function restartAutoplay() {
		stopAutoplay();
		startAutoplay();
	}

	nextButton.addEventListener('click', () => goToSlide((currentIndex + 1) % cards.length, true));
	prevButton.addEventListener('click', () => goToSlide((currentIndex - 1 + cards.length) % cards.length, true));

	// Pause on hover and on keyboard focus so nothing changes out from
	// under a reading user.
	section.addEventListener('mouseenter', stopAutoplay);
	section.addEventListener('mouseleave', startAutoplay);
	section.addEventListener('focusin', stopAutoplay);
	section.addEventListener('focusout', startAutoplay);

	startAutoplay();
}

/* ================================================================
   13. FAQ ACCORDION
   Only one answer open at a time, smooth height animation, and an
   arrow icon that rotates automatically via the existing
   [aria-expanded="true"]::after rule in style.css.
================================================================ */
function initializeFAQ() {
	const items = qsa('.faq-item');
	if (items.length === 0) return;

	items.forEach((item) => {
		const answer = qs('.faq-item__answer', item);
		if (!answer) return;

		// Swap the binary [hidden] attribute for a max-height collapse so
		// the open/close transition can actually be animated.
		answer.hidden = false;
		answer.style.overflow = 'hidden';
		answer.style.maxHeight = '0px';
		answer.style.transition = `max-height ${CONFIG.FAQ_TRANSITION}ms ease`;
	});

	items.forEach((item) => {
		const button = qs('.faq-item__question', item);
		const answer = qs('.faq-item__answer', item);
		if (!button || !answer) return;

		button.addEventListener('click', () => {
			const isOpen = button.getAttribute('aria-expanded') === 'true';

			// Accordion behaviour: collapse every other open item first.
			items.forEach((otherItem) => {
				if (otherItem === item) return;
				const otherButton = qs('.faq-item__question', otherItem);
				const otherAnswer = qs('.faq-item__answer', otherItem);
				if (otherButton?.getAttribute('aria-expanded') === 'true') {
					collapseFaqAnswer(otherButton, otherAnswer);
				}
			});

			isOpen ? collapseFaqAnswer(button, answer) : expandFaqAnswer(button, answer);
		});
	});

	// If the viewport is resized while an item is open, its cached
	// scrollHeight can go stale — re-measure so content never gets clipped.
	window.addEventListener(
		'resize',
		debounce(() => {
			qsa('.faq-item__question[aria-expanded="true"]').forEach((button) => {
				const answer = document.getElementById(button.getAttribute('aria-controls'));
				if (answer) answer.style.maxHeight = `${answer.scrollHeight}px`;
			});
		}, 200)
	);
}

function expandFaqAnswer(button, answer) {
	button.setAttribute('aria-expanded', 'true');
	answer.style.maxHeight = `${answer.scrollHeight}px`;
}

function collapseFaqAnswer(button, answer) {
	button.setAttribute('aria-expanded', 'false');
	answer.style.maxHeight = '0px';
}

/* ================================================================
   14. APPOINTMENT FORM VALIDATION
   Validates every field on submit (and on blur for early feedback),
   shows friendly inline error messages, and only shows the success
   message once every field passes.
================================================================ */
const FORM_VALIDATORS = {
	'patient-name': {
		validate: (value) => value.trim().length >= 2,
		message: 'Please enter your full name (at least 2 characters).',
	},
	'patient-phone': {
		validate: (value) => /^[+]?[\d\s()-]{7,20}$/.test(value.trim()),
		message: 'Please enter a valid phone number.',
	},
	'patient-email': {
		validate: (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()),
		message: 'Please enter a valid email address.',
	},
	'patient-department': {
		validate: (value) => value !== '',
		message: 'Please select a department.',
	},
	'preferred-date': {
		validate: (value) => {
			if (!value) return false;
			const today = new Date();
			today.setHours(0, 0, 0, 0);
			return new Date(value) >= today;
		},
		message: 'Please choose today or a future date.',
	},
	'preferred-time': {
		validate: (value) => value !== '',
		message: 'Please choose a preferred time.',
	},
	// The message field has no "required" attribute in index.html, so it
	// is intentionally left out of this validator map — it's optional.
};

function validateField(field) {
	const rule = FORM_VALIDATORS[field.id];
	if (!rule) return true;

	const isValid = rule.validate(field.value);
	isValid ? clearFieldError(field) : showFieldError(field, rule.message);
	return isValid;
}

function showFieldError(field, message) {
	field.setAttribute('aria-invalid', 'true');
	getOrCreateErrorElement(field).textContent = message;
}

function clearFieldError(field) {
	if (!field) return;
	field.removeAttribute('aria-invalid');
	const errorEl = document.getElementById(`${field.id}-error`);
	if (errorEl) errorEl.textContent = '';
}

/** Creates (once) and returns the inline error message element for a field. */
function getOrCreateErrorElement(field) {
	const errorId = `${field.id}-error`;
	let errorEl = document.getElementById(errorId);
	if (errorEl) return errorEl;

	errorEl = document.createElement('p');
	errorEl.id = errorId;
	errorEl.className = 'form-hint'; // reuse the existing hint styling from style.css
	errorEl.style.color = '#c0392b';
	errorEl.setAttribute('role', 'alert');
	field.insertAdjacentElement('afterend', errorEl);

	const describedBy = field.getAttribute('aria-describedby');
	field.setAttribute('aria-describedby', describedBy ? `${describedBy} ${errorId}` : errorId);

	return errorEl;
}

function setStatusMessage(statusEl, message, isError) {
	if (!statusEl) return;
	statusEl.textContent = message;
	statusEl.style.color = isError ? '#c0392b' : '';
}

function initializeAppointmentForm() {
	const form = document.getElementById('appointment-form');
	if (!form) return;
	const statusEl = document.getElementById('appointment-form-status');
	const fieldIds = Object.keys(FORM_VALIDATORS);

	form.addEventListener('submit', (event) => {
		event.preventDefault();

		let isValid = true;
		let firstInvalidField = null;

		fieldIds.forEach((fieldId) => {
			const field = document.getElementById(fieldId);
			if (!field) return;
			if (!validateField(field)) {
				isValid = false;
				firstInvalidField ??= field;
			}
		});

		if (!isValid) {
			firstInvalidField?.focus();
			setStatusMessage(statusEl, 'Please correct the highlighted fields and try again.', true);
			return;
		}

		// form.reset() fires a native "reset" event (unlike submit()), which
		// would otherwise wipe the success message via the reset listener
		// below — so reset the form first, then set the message last.
		form.reset();
		fieldIds.forEach((fieldId) => clearFieldError(document.getElementById(fieldId)));
		setStatusMessage(
			statusEl,
			'Thank you! Your appointment request has been received — our care team will contact you shortly.',
			false
		);
	});

	form.addEventListener('reset', () => {
		fieldIds.forEach((fieldId) => clearFieldError(document.getElementById(fieldId)));
		setStatusMessage(statusEl, '', false);
	});

	// Validate as soon as the visitor leaves a field, for immediate feedback
	// rather than waiting until they hit submit.
	fieldIds.forEach((fieldId) => {
		document.getElementById(fieldId)?.addEventListener('blur', (event) => validateField(event.target));
	});
}

/* ================================================================
   15. BACK-TO-TOP BUTTON
   Hidden by default, fades in once the page has scrolled past the
   threshold, scrolls smoothly back to the top on click.
================================================================ */
function initializeBackToTop() {
	const button = document.createElement('button');
	button.type = 'button';
	button.className = 'btn btn--primary';
	button.setAttribute('aria-label', 'Back to top');
	button.textContent = '↑';
	button.style.cssText = `
		position: fixed;
		right: 1.5rem;
		bottom: 1.5rem;
		width: 48px;
		height: 48px;
		padding: 0;
		border-radius: 50%;
		font-size: 1.25rem;
		z-index: 900;
		opacity: 0;
		visibility: hidden;
		transform: translateY(12px);
		transition: opacity .3s ease, transform .3s ease, visibility .3s;
	`;
	document.body.appendChild(button);

	const setVisible = (isVisible) => {
		button.style.opacity = isVisible ? '1' : '0';
		button.style.visibility = isVisible ? 'visible' : 'hidden';
		button.style.transform = isVisible ? 'translateY(0)' : 'translateY(12px)';
	};

	document.addEventListener(
		'scroll',
		() => setVisible(window.scrollY > CONFIG.BACK_TO_TOP_THRESHOLD),
		{ passive: true }
	);

	button.addEventListener('click', () => {
		window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
	});
}

/* ================================================================
   16. FLOATING EMERGENCY BUTTON
   Always-visible circular call button, reusing the same phone number
   already used by the header's emergency link (single source of
   truth) so the two can never drift out of sync.
================================================================ */
function initializeEmergencyButton() {
	const headerEmergencyLink = qs('.site-header__actions .btn--emergency');
	const phoneHref = headerEmergencyLink?.getAttribute('href');
	if (!phoneHref) return; // nothing to wire up if the header link isn't present

	const floatButton = document.createElement('a');
	floatButton.href = phoneHref;
	floatButton.className = 'btn btn--emergency'; // reuses the existing gradient + pulse animation
	floatButton.setAttribute('aria-label', 'Call emergency hotline');
	floatButton.textContent = '📞';
	floatButton.style.cssText = `
		position: fixed;
		left: 1.5rem;
		bottom: 1.5rem;
		width: 56px;
		height: 56px;
		padding: 0;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 1.4rem;
		z-index: 900;
		transition: transform .25s ease;
	`;

	floatButton.addEventListener('mouseenter', () => { floatButton.style.transform = 'scale(1.08)'; });
	floatButton.addEventListener('mouseleave', () => { floatButton.style.transform = ''; });
	floatButton.addEventListener('focus', () => { floatButton.style.transform = 'scale(1.08)'; });
	floatButton.addEventListener('blur', () => { floatButton.style.transform = ''; });

	document.body.appendChild(floatButton);
}

/* ================================================================
   17. LOADING SCREEN
   A full-viewport overlay with a spinner, shown immediately and
   faded out once the page (including images) has fully loaded.
   The spinner rotates via requestAnimationFrame rather than a CSS
   @keyframes rule, since this file must not touch style.css.
================================================================ */
function initializeLoadingScreen() {
	const overlay = document.createElement('div');
	overlay.setAttribute('role', 'status');
	overlay.setAttribute('aria-label', 'Loading page');
	overlay.style.cssText = `
		position: fixed;
		inset: 0;
		z-index: 9999;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--color-bg, #f8fbfd);
		transition: opacity .5s ease;
	`;

	const spinner = document.createElement('div');
	spinner.style.cssText = `
		width: 48px;
		height: 48px;
		border-radius: 50%;
		border: 4px solid rgba(10, 110, 189, 0.15);
		border-top-color: var(--color-primary, #0A6EBD);
	`;
	overlay.appendChild(spinner);
	document.body.prepend(overlay);

	let rotationDegrees = 0;
	let frameId = requestAnimationFrame(function spin() {
		rotationDegrees = (rotationDegrees + 6) % 360;
		spinner.style.transform = `rotate(${rotationDegrees}deg)`;
		frameId = requestAnimationFrame(spin);
	});

	let hasHidden = false;
	const hideOverlay = () => {
		if (hasHidden) return;
		hasHidden = true;
		overlay.style.opacity = '0';
		window.setTimeout(() => {
			cancelAnimationFrame(frameId);
			overlay.remove();
		}, 500);
	};

	window.addEventListener('load', hideOverlay);
	// Safety net: never leave a visitor stuck behind the loader, even if
	// "load" is unusually slow (large images) or already fired.
	window.setTimeout(hideOverlay, CONFIG.LOADING_SCREEN_SAFETY_TIMEOUT);
}

/* ================================================================
   18. THEME TOGGLE (LIGHT / DARK)
   Overrides a handful of the CSS custom properties already defined
   in style.css's :root, so no stylesheet changes are needed — every
   rule that reads --color-bg / --color-card / --color-text simply
   picks up the new values automatically. Preference is remembered in
   localStorage, defaulting to the OS-level color-scheme on first visit.
================================================================ */
const DARK_MODE_OVERRIDES = {
	'--color-bg': '#0b1420',
	'--color-card': '#16283c',
	'--color-text': '#dce6f0',
	'--color-text-light': '#9fb1c4',
};

function applyTheme(isDarkMode, toggleButton) {
	const root = document.documentElement;

	if (isDarkMode) {
		Object.entries(DARK_MODE_OVERRIDES).forEach(([property, value]) => root.style.setProperty(property, value));
	} else {
		Object.keys(DARK_MODE_OVERRIDES).forEach((property) => root.style.removeProperty(property));
	}

	// Headings (h2, h3) share --color-dark with the footer's background
	// in style.css, so that variable can't be repurposed for dark mode
	// without accidentally recolouring the (already-dark) footer too.
	// Instead, non-footer headings get a direct inline colour override.
	qsa('h2, h3').forEach((heading) => {
		if (heading.closest('.site-footer')) return;
		heading.style.color = isDarkMode ? '#eef4fa' : '';
	});

	toggleButton.textContent = isDarkMode ? '☀️ Light' : '🌙 Dark';
	toggleButton.setAttribute('aria-pressed', String(isDarkMode));
	toggleButton.setAttribute('aria-label', isDarkMode ? 'Switch to light mode' : 'Switch to dark mode');
}

function initializeThemeToggle() {
	const actions = qs('.site-header__actions');
	if (!actions) return;

	const toggleButton = document.createElement('button');
	toggleButton.type = 'button';
	toggleButton.className = 'btn btn--outline';
	toggleButton.style.cssText = 'min-height:40px; padding:.5rem .9rem;';
	actions.insertBefore(toggleButton, actions.firstChild);

	const storedPreference = localStorage.getItem(CONFIG.THEME_STORAGE_KEY);
	const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
	let isDarkMode = storedPreference ? storedPreference === 'dark' : systemPrefersDark;

	applyTheme(isDarkMode, toggleButton);

	toggleButton.addEventListener('click', () => {
		isDarkMode = !isDarkMode;
		applyTheme(isDarkMode, toggleButton);
		localStorage.setItem(CONFIG.THEME_STORAGE_KEY, isDarkMode ? 'dark' : 'light');
	});
}

/* ================================================================
   19. HEALTH TIPS CARDS
   Keyboard-focus parity with the CSS hover lift/image-zoom, plus a
   graceful, non-jarring click behaviour for the "Read More" links,
   which are still placeholders (href="#") until real articles exist.
================================================================ */
function initializeHealthTips() {
	const cards = qsa('.article-card');

	cards.forEach((card) => {
		const link = qs('.btn', card);

		const activate = () => {
			card.style.transform = 'translateY(-8px)';
			card.style.boxShadow = 'var(--shadow-lg)';
		};
		const deactivate = () => {
			card.style.transform = '';
			card.style.boxShadow = '';
		};

		card.addEventListener('focusin', activate);
		card.addEventListener('focusout', deactivate);

		link?.addEventListener('click', (event) => {
			if (link.getAttribute('href') === '#') {
				event.preventDefault();
				announce('Full article coming soon.');
			}
		});
	});
}

/* ================================================================
   20. CONTACT CARD INTERACTIONS
   The individual address/phone/email/hours rows in the contact
   section have no built-in hover treatment in style.css, so this adds
   a subtle highlight + shift for both mouse and keyboard users.
================================================================ */
function initializeContactCards() {
	const items = qsa('.contact__item');

	items.forEach((item) => {
		item.style.transition = 'background-color .25s ease, transform .25s ease';
		item.style.borderRadius = 'var(--radius-md)';

		const highlight = () => {
			item.style.backgroundColor = 'rgba(10, 110, 189, 0.06)';
			item.style.transform = 'translateX(4px)';
		};
		const reset = () => {
			item.style.backgroundColor = '';
			item.style.transform = '';
		};

		item.addEventListener('mouseenter', highlight);
		item.addEventListener('mouseleave', reset);
		item.addEventListener('focusin', highlight);
		item.addEventListener('focusout', reset);
	});
}

/* ================================================================
   21. FOOTER EFFECTS
   Footer link hover/focus styling is already fully handled by CSS;
   the one piece of real functionality still needed here is filling
   in the copyright year.
================================================================ */
function initializeFooterEffects() {
	const yearEl = document.getElementById('current-year');
	if (yearEl) yearEl.textContent = String(new Date().getFullYear());
}

/* ================================================================
   22. WEBSITE ORCHESTRATOR & BOOTSTRAP
================================================================ */
function initializeWebsite() {
	initializeStickyNavbar();
	initializeMobileMenu();
	initializeSmoothScroll();
	initializeActiveNavigation();
	initializeHeroButtons();
	initializeStatisticsCounter();
	initializeScrollReveal();
	initializeDepartmentCards();
	initializeDoctorCards();
	initializeTestimonials();
	initializeFAQ();
	initializeAppointmentForm();
	initializeBackToTop();
	initializeEmergencyButton();
	initializeThemeToggle();
	initializeHealthTips();
	initializeContactCards();
	initializeFooterEffects();
}

// The loading screen is created as early as possible to minimize any flash
// of unstyled/unloaded content, independent of the rest of the site logic.
initializeLoadingScreen();

// This file is loaded with <script defer>, so the DOM is already fully
// parsed and available by the time this line runs — but listening for
// DOMContentLoaded anyway is a harmless, conventional safety net in case
// the `defer` attribute is ever removed from index.html.
if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', initializeWebsite);
} else {
	initializeWebsite();
}

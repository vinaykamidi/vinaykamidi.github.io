$(document).ready(function() {
			// grab the initial top offset of the navigation
		   	var stickyNavTop = $('.vcard__menu,.main__menu').offset().top;

		   	// our function that decides weather the navigation bar should have "fixed" css position or not.
		   	var stickyNav = function(){
			    var scrollTop = $(window).scrollTop(); // our current vertical position from the top

			    // if we've scrolled more than the navigation, change its position to fixed to stick to top,
			    // otherwise change it back to relative
			    if (scrollTop > stickyNavTop) {
			        $('.vcard__menu,.main__menu').addClass('sticky');
			    } else {
			        $('.vcard__menu,.main__menu').removeClass('sticky');
			    }
			};

			stickyNav();
			// and run it again every time you scroll
			$(window).scroll(function() {
				stickyNav();
			});
		});
$('.menu__toggle').click(function(){
        $('.site__nav').toggleClass('site__nav--open', 400);
        $(this).toggleClass('open')
    });

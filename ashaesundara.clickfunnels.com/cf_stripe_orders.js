const applyAvalaraTaxAmount = function(amount) {
  const canChargeTax = ClickFunnels.CalculateTaxes.canCalcTaxes();
  const taxAmount = _.property(['cfpe'])(window).avalaraTaxAmount;

  if(canChargeTax && taxAmount) {
    return amount + taxAmount;
  }

  return amount;
}

var stripeResponseHandler = function(status, response) {
  var canAccess = $("meta[name='can_access_stripe_elements_upgrade']").attr('content');
  if (canAccess === 'true') {
    return;
  }

  var $form = $('#cfAR');
  if(typeof($form) != 'undefined'){
    if (response.error) {
      $('[data-href-original]').each(function(){
        $(this).attr('href', $(this).data('href-original'));
        $(this).removeAttr('data-href-original');
      });

      // Show the errors on the form
      console.log(response.error);
      $('#order-declined-message').html(response.error.message);
      $('#order-declined-message').show();
      window.location = "#order-declined-message";
      $('button').prop('disabled', false);
      $('[href=#submit-form], [href=#submit-form-2step-order]').text('Submit and Retry');
      $('[href=#submit-form], [href=#submit-form-2step-order]').prop('disabled', false);

    } else {
      // token contains id, last4, and card type
      var token = response.id;
      // Insert the token into the form so it gets submitted to the server
      $form.append($('<input type="hidden" name="purchase[stripe_customer_token]" />').val(token));
      // and submit
      //alert("submitting form");
      $form.get(0).submit();
    }
  }
};


function objectifyForm(formArray) {//serialize data function
  var returnArray = {};
  for (var i = 0; i < formArray.length; i++){
    returnArray[formArray[i]['name']] = formArray[i]['value'];
  }
  return returnArray;
}

function updatePurchase() {

}

function InitializeStripe() {
  var canAccess        = $("meta[name='can_access_stripe_elements_upgrade']").attr("content") === "true";
  var enabledForDomain = $("meta[name='stripe_enabled_for_domain']").attr("content") === "true";
  var stripeV3PlaceholderOnPage = $('#payment-request-button').length > 0;

  if (typeof Stripe !== 'undefined' && canAccess) {
    var publishableKey = $("meta[name='stripe_publishable_key']").attr("content");
    if (typeof(publishableKey) !== 'string') {
      throw new Error("Missing stripe publishable key");
    }

    window.stripe = Stripe(publishableKey);
    Stripe.setPublishableKey(publishableKey);

    // v3 - apple and google pay
    if (stripeV3PlaceholderOnPage && enabledForDomain) {
      beginV3PaymentRequest();
    }
  }
}

window.addEventListener('load', InitializeStripe);

function beginV3PaymentRequest(){
  var mainProduct = $('#cfAR input[name="purchase[product_ids][]"][data-product-currency-code]:checked').first();
  var lineItems = [];
  var total = 0;
  var mainLabel = mainProduct.data('business-name');
  var totalHash = { amount: 0 };
  var requestPayerPhone = false;
  var requestPayerName = false;
  var requestPayerEmail = true;
  var requestShipping = false;

  function updateOrder() {
    // v3 payment request button

    if(mainLabel == '' || mainLabel == 'undefined'){
      mainLabel = "Seller"
    }

    lineItems = [];
    total = 0;
    $('#cfAR input[name="purchase[product_ids][]"][data-product-currency-code]:checked').each(function(){
      var productAmt = parseFloat($(this).data('product-amount'))
      lineItems.push({ label: $(this).data('product-label'), amount: parseInt(productAmt*100) });
      if(typeof(productAmt) != "undefined"){
        total = total + parseInt(productAmt*100);
      }
    });

    if(window.cfpe.avalaraTaxAmount){
      total = applyAvalaraTaxAmount(total);
    }
    totalHash = { amount: parseFloat(total.toFixed()) };

    if( total == 0 ) {
      total = 1;
    }

    $('.required1').each(function(){
      switch($(this).attr('name')){
        case "phone":
          requestPayerPhone = true;
          break;
        case "address":
        case "shipping_address":
          requestShipping = true;
          break;
        case "zip":
        case "shipping_zip":
          requestShipping = true;
          break;
        case /(name|first_name|last_name)/i.test($(this).attr('name')):
          requestPayerName = true;
          break;
      }
    });

    if (typeof window.paymentRequest != 'undefined') {
      var options = {
        displayItems: lineItems,
        shippingOptions: [
          // The first shipping option in this list appears as the default
          // option in the browser payment interface.
          {
            id: 'shipping-included',
            label: 'Shipping Included',
            amount: 0,
          }
        ],
        total: {
          label: mainLabel,
          amount: parseFloat(total.toFixed())
        }
      };
      window.paymentRequest.update(options);
    }
  }

  updateOrder();

  $('input[name*="purchase[product_id"]').on('change', function () { updateOrder(); });

  function finalizeOrder(result) {

    // Include contact/purchase json
    formData = objectifyForm($('#cfAR').serializeArray());

    formData['purchase[stripe_customer_token]'] = result.token.id;
    $('#cfAR').append($('<input/>',{"name":"purchase[stripe_customer_token]","value":result.token.id,"type":"hidden"}));
    // TODO: populate fields from apple pay to formData

    // Contact Information
    // emailAddress
    // An email address for the contact.
    // familyName
    // The contact’s family name.
    // givenName
    // The contact’s given name.
    // phoneNumber
    // A phone number for the contact.
    if(result.payerEmail != null && result.payerEmail != ''){
      formData['contact[email]'] = result.payerEmail;
      $('#cfAR input[name="contact[email]"]').val(result.payerEmail);
    }
    if(result.payerName == null){
      if(result.shippingAddress != null){
        formData['contact[name]'] = result.shippingAddress.recipient;
        $('#cfAR input[name="contact[name]"]').val(result.shippingAddress.recipient);
      }
    }else{
      formData['contact[name]'] = result.payerName;
      $('#cfAR input[name="contact[name]"]').val(result.payerName);
    }
    if(result.phoneNumber != null && result.phoneNumber != ''){
      formData['contact[phone]'] = result.payerPhone;
      $('#cfAR input[name="contact[phone]"]').val(result.payerPhone);
    }

    // Address Information
    // addressLines
    // The address for the contact.
    // locality
    // The city for the contact.
    // administrativeArea
    // The state for the contact.
    // postalCode
    // The zip code, where applicable, for the contact.
    // country
    // The colloquial country name for the contact.
    // countryCode
    // The contact’s ISO country code.
    if(result.shippingAddress && result.shippingAddress.addressLine != ''){
      formData['contact[shipping_address]'] = result.shippingAddress.addressLine;
      $('#cfAR input[name="contact[shipping_address]"]').val(result.shippingAddress.addressLine);
    }
    if(result.shippingAddress && result.shippingAddress.city != ''){
      formData['contact[shipping_city]'] = result.shippingAddress.city;
      $('#cfAR input[name="contact[shipping_city]"]').val(result.shippingAddress.city);
    }
    if(result.shippingAddress && result.shippingAddress.region != ''){
      formData['contact[shipping_state]'] = result.shippingAddress.region;
      $('#cfAR input[name="contact[shipping_state]"]').val(result.shippingAddress.region);
    }
    if(result.shippingAddress && result.shippingAddress.postalCode != ''){
      formData['contact[shipping_zip]'] = result.shippingAddress.postalCode;
      $('#cfAR input[name="contact[shipping_zip]"]').val(result.shippingAddress.postalCode);
    }
    if(result.shippingAddress && result.shippingAddress.country != ''){
      formData['contact[shipping_country]'] = result.shippingAddress.country;
      $('#cfAR input[name="contact[shipping_country]"]').val(result.shippingAddress.country);
    }

    url = document.location.href;

    formData = $('#cfAR').serializeArray();

    $.post(url, formData, '', 'json')
    .success(function( data ) {
      result.complete('success');
      // You can now redirect the user to a receipt page, etc.
      window.location.href = data.redirect_url;
    })
    .fail(function(data) {
      //alert(' data: '+data.redirect_url);
      //alert(' failure ');
      $('.otoloading').hide();
      result.complete('fail');
    });

    // result.complete('success');
    // $('#cfAR').submit();
  }

  window.paymentRequest = stripe.paymentRequest({
    country: 'US',
    currency: mainProduct.data('product-currency-code').toLowerCase(),
    requestPayerName: requestPayerName,
    requestPayerPhone: requestPayerPhone,
    requestPayerEmail: requestPayerEmail,
    requestShipping: requestShipping,
    displayItems: lineItems,
    shippingOptions: [
      // The first shipping option in this list appears as the default
      // option in the browser payment interface.
      {
        id: 'shipping-included',
        label: 'Shipping Included',
        amount: 0,
      }
    ],
    total: {
      label: mainLabel,
      amount: parseFloat(total.toFixed())
    }
  });

  var elements = stripe.elements();
  var stripePaymentRequestButton = elements.create('paymentRequestButton', {
    paymentRequest: window.paymentRequest,
  });

  // This weird construction of getting an element by ID is used
  // because document.getElementById and $("#...") only return
  // the first element with that ID. If multiple #payment-request-buttons
  // end up on the page accidentally, we need to hide all of them if
  // mobile pay is not available, or hide all but the last
  // if mobile pay is available.
  var allPaymentButtons = $('[id="payment-request-button"]');
  let availablePaymentButtons = allPaymentButtons.filter(function() {
      var button = $(this);
      var ccForm = button.closest(".elCreditCardForm");
      if (ccForm.length === 0) {
        return true;
      }

      var overridden = ccForm.data('hide-mobile-pay');

      return overridden !== "true";
  });

  var lastPaymentButton = availablePaymentButtons.last().get(0);
  var remainingPaymentButtons = availablePaymentButtons.not(":last");

  remainingPaymentButtons.hide();

  // Check the availability of the Payment Request API first.
  window.paymentRequest.canMakePayment().then(function(result) {
    if (result && lastPaymentButton) {
      stripePaymentRequestButton.mount(lastPaymentButton);
      $(lastPaymentButton).show();
    } else {
      allPaymentButtons.hide();
    }
  });

  window.paymentRequest.on('token', function(ev) {
    $('.otoloading').show();
    // Send the token to your server to charge it!
    finalizeOrder(ev);
  });
}

// v2 apple pay only
// Apple Pay Support
if(document.getElementById('apple-pay-button') !== null){
  document.getElementById('apple-pay-button').addEventListener('click', beginApplePay);
}

function updateApplePay(){
  var mainProduct = $('#cfAR input[name="purchase[product_ids][]"][data-product-currency-code]:checked').first();
  var mainLabel = mainProduct.data('business-name');

  if(mainLabel == '' || mainLabel == 'undefined'){
    mainLabel = "Seller"
  }

  lineItems = [];
  total = 0;
  $('#cfAR input[name="purchase[product_ids][]"][data-product-currency-code]:checked').each(function(){
    var productAmt = parseFloat($(this).data('product-amount'))
    lineItems.push({ label: $(this).data('product-label'), amount: parseInt(productAmt*100) });
    if(typeof(productAmt) != "undefined"){
      total = total + parseInt(productAmt*100);
    }
  });

  if(window.cfpe.avalaraTaxAmount){
    total = applyAvalaraTaxAmount(total);
  }
  totalHash = { amount: parseFloat(total.toFixed()) };

  if( total == 0 ) {
    total = 1;
  }

  $('.required1').each(function(){
    switch($(this).attr('name')){
      case "phone":
        requestPayerPhone = true;
        break;
      case "address":
      case "shipping_address":
        requestShipping = true;
        break;
      case "zip":
      case "shipping_zip":
        requestShipping = true;
        break;
      case /(name|first_name|last_name)/i.test($(this).attr('name')):
        requestPayerName = true;
        break;
    }
  });

  if (typeof window.paymentRequest != 'undefined') {
    var options = {
      displayItems: lineItems,
      shippingOptions: [
        // The first shipping option in this list appears as the default
        // option in the browser payment interface.
        {
          id: 'shipping-included',
          label: 'Shipping Included',
          amount: 0,
        }
      ],
      total: {
        label: mainLabel,
        amount: parseFloat(total.toFixed())
      }
    };
    window.paymentRequest.update(options);
  }
}

function beginApplePay() {
  // https://stripe.com/docs/stripe.js#collecting-apple-pay-details

  var mainProduct = $('#cfAR input[name="purchase[product_ids][]"][data-product-currency-code]:checked').first();
  var lineItems = [];
  var total = 0.0;
  var mainLabel = mainProduct.data('business-name');
  if(mainLabel == '' || mainLabel == 'undefined'){
    mainLabel = "Seller"
  }

  $('#cfAR input[name="purchase[product_ids][]"][data-product-currency-code]:checked').each(function(){
    var productAmt = parseFloat($(this).data('product-amount').toFixed(2));
    lineItems.push({ type: 'final', label: $(this).data('product-label'), amount: productAmt });
    if(typeof(productAmt) != "undefined"){
      total = total + productAmt;
    }
  });

  if(window.cfpe.avalaraTaxAmount){
    total = applyAvalaraTaxAmount(total);
  }
  if( total == 0.0 ){
    total = 0.01;
  }

  var totalHash = { amount: parseFloat(total.toFixed()) }

  // TODO: Add required fields from page
  var requiredBillingContactFields = [];
  // "requiredBillingContactFields": [
  //   "postalAddress"
  // ]
  var requiredShippingContactFields = ['email'];
  // "requiredShippingContactFields": [
  //     "postalAddress",
  //     "name",
  //     "phone",
  //     "email"
  // ]


  $('.required1').each(function(){
    //console.log('required; ' + $(this).attr('name'))
    switch($(this).attr('name')){
      case "phone":
        requiredShippingContactFields.push('phone');
        break;
      case "address":
        requiredShippingContactFields.push('postalAddress');
        break;
      case "zip":
        requiredShippingContactFields.push('postalAddress');
        break;
      case /(name|first_name|last_name)/i.test($(this).attr('name')):
        requiredShippingContactFields.push('name');
        break;
    }
  });

  window.paymentRequest = {
    countryCode: 'US',
    currencyCode: mainProduct.data('product-currency-code'),
    requiredBillingContactFields: requiredBillingContactFields,
    requiredShippingContactFields: requiredShippingContactFields,
    lineItems: lineItems,
    total: {
      label: mainLabel,
      amount: parseFloat(total.toFixed())
    }
  };

  var session = Stripe.applePay.buildSession(window.paymentRequest,
    function(result, completion) {
      console.log("result: "+ JSON.stringify(result) );

    // Include contact/purchase json
    formData = objectifyForm($('#cfAR').serializeArray());

    formData['purchase[stripe_customer_token]'] = result.token.id
    // TODO: populate fields from apple pay to formData

    // Contact Information
    // emailAddress
    // An email address for the contact.
    // familyName
    // The contact’s family name.
    // givenName
    // The contact’s given name.
    // phoneNumber
    // A phone number for the contact.
    if(result.shippingContact && result.shippingContact.emailAddress != ''){
      formData['contact[email]'] = result.shippingContact.emailAddress;
    }
    if(result.shippingContact && result.shippingContact.familyName != ''){
      formData['contact[last_name]'] = result.shippingContact.familyName;
    }
    if(result.shippingContact && result.shippingContact.givenName != ''){
      formData['contact[first_name]'] = result.shippingContact.givenName;
    }
    if(result.shippingContact && result.shippingContact.phoneNumber != ''){
      formData['contact[phone]'] = result.shippingContact.phoneNumber;
    }

    // Address Information
    // addressLines
    // The address for the contact.
    // locality
    // The city for the contact.
    // administrativeArea
    // The state for the contact.
    // postalCode
    // The zip code, where applicable, for the contact.
    // country
    // The colloquial country name for the contact.
    // countryCode
    // The contact’s ISO country code.
    if(result.shippingContact && result.shippingContact.addressLines != ''){
      formData['contact[shipping_address]'] = result.shippingContact.addressLines;
    }
    if(result.shippingContact && result.shippingContact.locality != ''){
      formData['contact[shipping_city]'] = result.shippingContact.locality;
    }
    if(result.shippingContact && result.shippingContact.administrativeArea != ''){
      formData['contact[shipping_state]'] = result.shippingContact.administrativeArea;
    }
    if(result.shippingContact && result.shippingContact.postalCode != ''){
      formData['contact[shipping_zip]'] = result.shippingContact.postalCode;
    }
    if(result.shippingContact && result.shippingContact.country != ''){
      formData['contact[shipping_country]'] = result.shippingContact.country;
    }
    if(result.shippingContact && result.shippingContact.countryCode != ''){
      //formData['contact[shipping_country]'] = result.shippingContact.countryCode;
    }

    url = document.location.href;

    $.post(url, formData, '', 'json').done(function( data ) {
      completion(ApplePaySession.STATUS_SUCCESS);
      // You can now redirect the user to a receipt page, etc.
      window.location.href = data.redirect_url;
    }).fail(function(data) {
      //alert(' data: '+data.redirect_url);
      //alert(' failure ');
      completion(ApplePaySession.STATUS_FAILURE);
    });

  }, function(error) {
    alert(error.message);
  });

  session.oncancel = function() {
    //alert("User hit the cancel button in the payment window");
  };

  session.begin();
}

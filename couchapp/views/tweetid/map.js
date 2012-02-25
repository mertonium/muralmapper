function(doc) {  
    // The default _id field is a string, but we are using the numeric id from twitter.
    // This means that the default ordering doesn't quite work.
    // This view is mean to give us numeric ids so sorting works correctly.
    if(doc.id) emit(doc.id, doc);
}